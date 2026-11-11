import { AsyncLocalStorage } from 'node:async_hooks'
import { pathToFileURL } from 'node:url'
import { parentPort } from 'node:worker_threads'
import {
  normalizeModels,
  channelUrl,
  redactError,
  resolvePackageEntry,
} from './channel-contract.mjs'

const scope = new AsyncLocalStorage()
const channels = new Map()
const authSessions = new Map()
const streams = new Map()
let nextAuthSession = 1
const AUTH_SESSION_TTL_MS = 10 * 60_000

const nativeFetch = globalThis.fetch
let undiciModule = null
let undiciLoading = null
const proxyAgents = new Map()

function undici() {
  undiciLoading ??= import('undici')
    .then((module) => (undiciModule = module))
    .catch(() => {
      throw Object.assign(
        new Error('proxy support is unavailable: install the undici dependency'),
        { code: 'PROXY' },
      )
    })
  return undiciLoading
}

function normalizeProxy(value) {
  if (typeof value !== 'string' || !value.trim()) return undefined
  let url
  try {
    url = new URL(value.trim())
  } catch {
    throw Object.assign(new Error('代理地址无效，需要 HTTP(S) 代理 URL'), { code: 'PROXY' })
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw Object.assign(new Error('代理地址必须以 http:// 或 https:// 开头'), { code: 'PROXY' })
  }
  return url.toString()
}

const MAX_PROXY_AGENTS = 8

async function dispatcherFor(proxy) {
  const normalized = normalizeProxy(proxy)
  if (!normalized) return undefined
  const cached = proxyAgents.get(normalized)
  if (cached) return cached
  const module = await undici()
  if (typeof module.ProxyAgent !== 'function') {
    throw Object.assign(new Error('undici ProxyAgent is unavailable'), { code: 'PROXY' })
  }
  const agent = new module.ProxyAgent(normalized)
  proxyAgents.set(normalized, agent)
  if (proxyAgents.size > MAX_PROXY_AGENTS) {
    const oldest = proxyAgents.keys().next().value
    if (oldest !== undefined && oldest !== normalized) {
      const stale = proxyAgents.get(oldest)
      proxyAgents.delete(oldest)
      // A ProxyAgent owns a socket pool; dropping the reference alone leaks it.
      Promise.resolve(stale?.close?.()).catch(() => {})
    }
  }
  return agent
}

// Channel packages call bare `fetch`. Route those calls through the account's
// proxy when the current operation carries one, without leaking the proxy
// between concurrent accounts.
globalThis.fetch = async function hitchfinFetch(input, init) {
  const dispatcher = scope.getStore()?.dispatcher
  if (!dispatcher) return nativeFetch(input, init)
  const module = await undici()
  const request = input instanceof Request ? input : null
  const options = { ...(init ?? {}), dispatcher }
  if (request) {
    options.method = init?.method ?? request.method
    options.headers = init?.headers ?? request.headers
    if (init?.body === undefined && request.body !== null) {
      options.body = await request.clone().arrayBuffer()
    }
  }
  return module.fetch(request ? request.url : String(input), options)
}

function post(message) {
  parentPort?.postMessage(message)
}

function serializeError(error) {
  const cause = error?.cause
  const causeMessage =
    cause instanceof Error
      ? cause.message
      : cause && typeof cause === 'object' && typeof cause.message === 'string'
        ? cause.message
        : typeof cause === 'string'
          ? cause
          : ''
  const causeCode =
    cause && typeof cause === 'object' && typeof cause.code === 'string' ? cause.code : ''
  const base = error instanceof Error ? error.message : String(error)
  return {
    message: redactError(causeMessage && !base.includes(causeMessage) ? `${base} (${causeMessage})` : base),
    code: typeof error?.code === 'string' ? error.code : 'CHANNEL_ERROR',
    ...(causeCode ? { causeCode } : {}),
    ...(typeof error?.status === 'number' ? { status: error.status } : {}),
    ...(typeof error?.providerRetryAfterMs === 'number'
      ? { providerRetryAfterMs: error.providerRetryAfterMs }
      : {}),
  }
}

function stub(name) {
  return new Proxy(async () => ({ data: undefined }), {
    get(_, key) {
      if (key === 'then') return undefined
      return stub(`${name}.${String(key)}`)
    },
    apply() {
      return Promise.resolve({ data: undefined })
    },
  })
}

function makeClient(channelId) {
  const known = {
    auth: {
      // OpenCode SDK shape: auth.set({ path: { id }, body })
      set: async (opts) => {
        const body = opts?.body ?? opts?.auth
        const current = scope.getStore()
        if (body && current?.accountId) {
          current.auth = body
          post({
            type: 'authChanged',
            channelId,
            accountId: current.accountId,
            auth: body,
          })
        }
        return { data: true }
      },
      remove: async () => ({ data: true }),
    },
    tui: {
      showToast: async () => ({ data: true }),
    },
    app: {
      log: async () => ({ data: true }),
    },
    config: {
      get: async () => ({ data: {} }),
    },
  }
  const wrap = (obj, name) =>
    new Proxy(obj, {
      get(target, key) {
        if (key in target) {
          const value = target[key]
          return value && typeof value === 'object' ? wrap(value, `${name}.${String(key)}`) : value
        }
        if (key === 'then') return undefined
        return stub(`${name}.${String(key)}`)
      },
    })
  return wrap(known, 'client')
}

function makeMagpie(state) {
  return {
    option: (...args) => {
      const key = args.length === 1 ? args[0] : args[1]
      const current = scope.getStore()
      if (key === 'free_only' && typeof current?.freeOnly === 'boolean') {
        return current.freeOnly
      }
      return state.options[key]
    },
    options: () => state.options,
    load: () => {},
    usage: () => {},
    account: () => scope.getStore()?.accountId ?? '',
  }
}

function factoryOf(mod, exportName) {
  if (exportName && typeof mod?.[exportName] === 'function') return mod[exportName]
  const fallback = mod?.default
  if (fallback && typeof fallback === 'object' && typeof fallback.server === 'function') {
    return fallback.server
  }
  if (typeof fallback === 'function') return fallback
  for (const value of Object.values(mod ?? {})) {
    if (typeof value === 'function') return value
  }
  return null
}

async function loadChannel(channel) {
  const entry = resolvePackageEntry(channel.channelId, channel.packagePath)
  const key = `${channel.channelId}\0${entry}\0${channel.exportName}`
  const cached = channels.get(key)
  if (cached) return cached

  const mod = await import(pathToFileURL(entry).href)
  const factory = factoryOf(mod, channel.exportName)
  if (!factory) {
    throw new Error(`${channel.channelId}: package exports no plugin factory`)
  }

  const state = { options: { ...(channel.options ?? {}) } }
  const input = {
    client: makeClient(channel.channelId),
    project: { id: 'dsh-hitchfin', worktree: process.cwd(), time: { created: Date.now() } },
    directory: process.cwd(),
    worktree: process.cwd(),
    experimental_workspace: { register() {} },
    serverUrl: new URL('http://127.0.0.1:4096'),
    $: async () => ({ stdout: '', stderr: '', exitCode: 0 }),
    magpie: makeMagpie(state),
  }

  const hooks = (await factory(input, {})) ?? {}
  let providerConfig = {}
  if (typeof hooks?.config === 'function') {
    const config = { provider: {} }
    try {
      await hooks.config(config)
      providerConfig = config.provider?.[hooks?.auth?.provider ?? channel.provider] ?? {}
    } catch {
      // A config hook that needs a network round trip can fail here; the
      // loader's baseURL or the channel's own fetch still decides the route.
    }
  }
  const loaded = {
    channel,
    hooks,
    state,
    providerConfig,
    provider: typeof hooks?.auth?.provider === 'string' ? hooks.auth.provider : channel.provider,
  }
  channels.set(key, loaded)
  post({
    type: 'audit',
    channelId: channel.channelId,
    packagePath: entry,
  })
  return loaded
}

function getAuth() {
  return scope.getStore()?.auth
}

async function staticModels(loaded) {
  const config = { provider: {} }
  if (typeof loaded.hooks?.config === 'function') {
    await loaded.hooks.config(config)
  }
  return config.provider?.[loaded.provider]?.models ?? {}
}

async function handleDescribe(message) {
  const loaded = await loadChannel(message.channel)
  const methods = Array.isArray(loaded.hooks?.auth?.methods)
    ? loaded.hooks.auth.methods.map((method, index) => ({
        index,
        type: typeof method?.type === 'string' ? method.type : '',
        label: typeof method?.label === 'string' ? method.label : '',
      }))
    : []
  return {
    provider: loaded.provider,
    methods,
    hooks: Object.keys(loaded.hooks ?? {}),
  }
}

async function handleModels(message) {
  const loaded = await loadChannel(message.channel)
  const dispatcher = await dispatcherFor(message.proxy)
  const freeOnly = Boolean(message.freeOnly)
  const base = await scope.run(
    {
      channelId: message.channel.channelId,
      accountId: message.accountId,
      freeOnly,
      ...(dispatcher ? { dispatcher } : {}),
    },
    () => staticModels(loaded),
  )
  let models = base
  let liveFailed = false
  let liveError

  if (message.auth && typeof loaded.hooks?.provider?.models === 'function') {
    const auth = message.auth
    try {
      const live = await scope.run(
        {
          channelId: message.channel.channelId,
          accountId: message.accountId,
          auth,
          freeOnly,
          ...(dispatcher ? { dispatcher } : {}),
        },
        () => loaded.hooks.provider.models({ id: loaded.provider, models: base }, { auth }),
      )
      // Every channel package returns the very object we handed in when its
      // live read fails (`return provider.models`), while a successful read
      // builds a fresh map. Publishing that placeholder as the account's real
      // catalog showed a handful of stale models with no error anywhere.
      if (live && typeof live === 'object' && !Array.isArray(live) && live !== base) {
        models = live
      } else {
        liveFailed = true
        liveError = 'channel returned its static fallback catalog'
      }
    } catch (error) {
      liveFailed = true
      liveError = redactError(error)
    }
  }

  return {
    // A failed live read reports an empty catalog plus an explicit failure, so
    // neither the settings page nor the DSH picker can mistake the built-in
    // placeholder table for the account's models.
    models: liveFailed
      ? []
      : normalizeModels(models, {
          filterInternal: message.channel.channelId === 'trae-cn',
          humanizeEmptyNames: message.channel.channelId === 'trae-cn',
        }),
    liveFailed,
    ...(liveError ? { liveError } : {}),
  }
}

/**
 * Drop this channel's cached plugin instance. The Trae package keeps a failed
 * model read in a module-scope `readAt` map for five minutes, so a transient
 * failure would otherwise keep serving the static fallback. Its factory builds
 * fresh state on every call, which is exactly what a forced refresh needs.
 */
function handleReload(message) {
  const channelId = typeof message.channel?.channelId === 'string' ? message.channel.channelId : ''
  if (!channelId) return { dropped: 0 }
  const prefix = `${channelId}\0`
  let dropped = 0
  for (const key of channels.keys()) {
    if (key.startsWith(prefix)) {
      channels.delete(key)
      dropped += 1
    }
  }
  return { dropped }
}

async function handleApiKey(message) {
  const loaded = await loadChannel(message.channel)
  const methods = loaded.hooks?.auth?.methods
  const method = Array.isArray(methods) ? methods[message.method] : undefined
  if (!method || method.type !== 'api') {
    throw new Error(`${loaded.provider}: no API key method ${message.method}`)
  }
  const key = String(message.key ?? '').trim()
  if (!key) throw new Error('API key is required')
  const inputs = message.inputs && typeof message.inputs === 'object' ? message.inputs : {}
  return {
    provider: loaded.provider,
    auth: {
      type: 'api',
      key,
      ...(Object.keys(inputs).length > 0 ? { metadata: inputs } : {}),
    },
  }
}

async function handleUsage(message) {
  const loaded = await loadChannel(message.channel)
  if (typeof loaded.hooks?.auth?.usage !== 'function') {
    return { usage: { error: 'channel has no usage hook' } }
  }
  const auth = message.auth
  if (!auth) return { usage: { error: 'not signed in' } }
  const dispatcher = await dispatcherFor(message.proxy)
  const usage = await scope.run(
    {
      channelId: message.channel.channelId,
      accountId: message.accountId,
      auth,
      ...(dispatcher ? { dispatcher } : {}),
    },
    () => loaded.hooks.auth.usage(getAuth, loaded.provider),
  )
  return { usage: usage ?? {} }
}

async function handleAuthorize(message) {
  const loaded = await loadChannel(message.channel)
  const methods = loaded.hooks?.auth?.methods
  const method = Array.isArray(methods) ? methods[message.method] : undefined
  if (!method || typeof method.authorize !== 'function') {
    throw new Error(`${loaded.provider}: no sign-in method ${message.method}`)
  }

  const controller = new AbortController()
  const proxy = normalizeProxy(message.proxy)
  const dispatcher = await dispatcherFor(proxy)
  const inputs =
    message.inputs ??
    (Array.isArray(method.prompts) && method.prompts.length > 0 ? {} : undefined)
  const started = await scope.run(
    {
      channelId: message.channel.channelId,
      accountId: message.accountId,
      auth: undefined,
      ...(dispatcher ? { dispatcher } : {}),
    },
    () => method.authorize(inputs, { signal: controller.signal }),
  )

  if (started?.type === 'failed') {
    controller.abort()
    throw new Error(typeof started.error === 'string' ? started.error : 'sign-in failed')
  }
  if (typeof started?.callback !== 'function') {
    controller.abort()
    throw new Error(`${loaded.provider}: sign-in returned no callback`)
  }

  const session = String(nextAuthSession++)
  const record = {
    provider: loaded.provider,
    channelId: message.channel.channelId,
    accountId: message.accountId,
    method: started.method === 'code' ? 'code' : 'auto',
    callback: started.callback,
    controller,
    proxy,
    timer: undefined,
  }
  // A sign-in nobody finishes must release its controller (and a browser
  // sign-in's loopback server hooks) on its own.
  record.timer = setTimeout(() => {
    const current = authSessions.get(session)
    if (current !== record) return
    authSessions.delete(session)
    controller.abort()
  }, AUTH_SESSION_TTL_MS)
  record.timer.unref?.()
  authSessions.set(session, record)

  return {
    session,
    url: typeof started.url === 'string' ? started.url : '',
    instructions: typeof started.instructions === 'string' ? started.instructions : '',
    method: started.method === 'code' ? 'code' : 'auto',
    opened: started.opened === true,
  }
}

function normalizeAuth(result) {
  if (!result || typeof result !== 'object') {
    throw new Error('sign-in returned no auth')
  }
  const { type, provider, refresh, access, expires, ...extra } = result
  if (type === 'success') {
    // OpenCode callbacks answer { type: 'success', provider, refresh, access,
    // expires, ... }; channel loaders expect { type: 'oauth', ... }.
    return {
      type: 'oauth',
      ...(typeof refresh === 'string' ? { refresh } : {}),
      ...(typeof access === 'string' ? { access } : {}),
      ...(typeof expires === 'number' ? { expires } : {}),
      ...extra,
    }
  }
  if (type === 'api' || typeof result.key === 'string') {
    return { type: 'api', ...extra, ...(typeof result.key === 'string' ? { key: result.key } : {}) }
  }
  if (type === 'oauth') {
    return { type, ...extra }
  }
  throw new Error(`unsupported sign-in result type ${String(type)}`)
}

async function handleCallback(message) {
  const session = authSessions.get(message.session)
  if (!session) throw new Error('no such sign-in session')
  authSessions.delete(message.session)
  clearTimeout(session.timer)
  const dispatcher = await dispatcherFor(session.proxy)

  const result = await scope.run(
    {
      channelId: session.channelId,
      accountId: session.accountId,
      auth: undefined,
      ...(dispatcher ? { dispatcher } : {}),
    },
    () =>
      session.callback(
        session.method === 'code' ? message.code ?? '' : undefined,
        { signal: session.controller.signal },
      ),
  )

  if (!result || result.type !== 'success') {
    throw new Error(typeof result?.error === 'string' ? result.error : 'sign-in failed')
  }
  return {
    provider: typeof result.provider === 'string' ? result.provider : session.provider,
    auth: normalizeAuth(result),
  }
}

function sdkHeaders(npm, apiKey) {
  if (!apiKey) return {}
  if (npm === '@ai-sdk/anthropic' || npm === '@ai-sdk/google-vertex/anthropic') {
    return { 'x-api-key': apiKey }
  }
  return { authorization: `Bearer ${apiKey}` }
}

async function handleFetch(message) {
  const loaded = await loadChannel(message.channel)
  const auth = message.auth
  if (!auth) {
    throw Object.assign(new Error(`${loaded.provider} is not signed in`), { code: 'AUTH' })
  }

  const controller = new AbortController()

  try {
    // Register inside the try: a proxy or import failure must not leave a dead
    // controller in `streams` for the rest of the worker's life.
    streams.set(message.id, controller)
    const dispatcher = await dispatcherFor(message.proxy)
    await scope.run(
      {
        channelId: message.channel.channelId,
        accountId: message.accountId,
        auth,
        freeOnly: Boolean(message.freeOnly),
        ...(dispatcher ? { dispatcher } : {}),
      },
      async () => {
        const chatHeaders = {}
        if (typeof loaded.hooks?.['chat.headers'] === 'function') {
          await loaded.hooks['chat.headers'](
            {
              sessionID: message.sessionId ?? '',
              agent: 'build',
              model: { id: message.model ?? '', providerID: loaded.provider },
              provider: { source: 'custom', info: { id: loaded.provider }, options: {} },
            },
            { headers: chatHeaders },
          )
        }

        const options =
          (await loaded.hooks?.auth?.loader?.(getAuth, { id: loaded.provider })) ?? {}
        if (!options || Object.keys(options).length === 0) {
          throw Object.assign(new Error(`${loaded.provider} is not signed in`), { code: 'AUTH' })
        }

        const headers = new Headers()
        for (const [key, value] of Object.entries(options.headers ?? {})) {
          headers.set(key, String(value))
        }
        for (const [key, value] of Object.entries(sdkHeaders(options.npm, options.apiKey))) {
          headers.set(key, String(value))
        }
        for (const [key, value] of Object.entries(message.request?.headers ?? {})) {
          headers.set(key, String(value))
        }
        for (const [key, value] of Object.entries(chatHeaders)) {
          headers.set(key, String(value))
        }

        const fetchImpl = typeof options.fetch === 'function' ? options.fetch : fetch
        const url = channelUrl(loaded, options, message.request?.url)
        const response = await fetchImpl(url, {
          method: message.request?.method ?? 'POST',
          headers,
          body: message.request?.body,
          signal: controller.signal,
        })

        const responseHeaders = {}
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value
        })
        post({
          id: message.id,
          type: 'head',
          status: response.status,
          headers: responseHeaders,
        })

        if (!response.body) {
          post({ id: message.id, type: 'end' })
          return
        }

        const reader = response.body.getReader()
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            if (value) {
              post({
                id: message.id,
                type: 'chunk',
                data: Buffer.from(value).toString('base64'),
              })
            }
          }
        } finally {
          await reader.cancel().catch(() => {})
        }
        post({ id: message.id, type: 'end' })
      },
    )
  } catch (error) {
    console.error('[dsh-hitchfin worker] fetch failed:', redactError(error))
    post({ id: message.id, type: 'error', error: serializeError(error) })
  } finally {
    streams.delete(message.id)
  }
}

async function handle(message) {
  switch (message.type) {
    case 'describe':
      return handleDescribe(message)
    case 'models':
      return handleModels(message)
    case 'reload':
      return handleReload(message)
    case 'usage':
      return handleUsage(message)
    case 'authorize':
      return handleAuthorize(message)
    case 'apiKey':
      return handleApiKey(message)
    case 'callback':
      return handleCallback(message)
    default:
      throw new Error(`unknown worker message: ${message.type}`)
  }
}

parentPort?.on('message', (message) => {
  if (!message || typeof message !== 'object') return
  if (message.type === 'fetch') {
    handleFetch(message).catch((error) => {
      post({ id: message.id, type: 'error', error: serializeError(error) })
    })
    return
  }
  if (message.type === 'cancelFetch') {
    streams.get(message.id)?.abort()
    return
  }
  if (message.type === 'cancelAuth') {
    const session = authSessions.get(message.session)
    if (session) {
      clearTimeout(session.timer)
      session.controller.abort()
      authSessions.delete(message.session)
    }
    return
  }
  handle(message)
    .then((result) => post({ id: message.id, ok: true, result }))
    .catch((error) => post({ id: message.id, ok: false, error: serializeError(error) }))
})

process.on('unhandledRejection', (error) => {
  console.error('[dsh-hitchfin worker] unhandled rejection:', redactError(error))
})
process.on('uncaughtException', (error) => {
  console.error('[dsh-hitchfin worker] uncaught exception:', redactError(error))
  // The worker cannot be trusted after an uncaught exception. Exiting lets the
  // host's crash breaker recycle it instead of serving corrupted state.
  process.exit(1)
})
