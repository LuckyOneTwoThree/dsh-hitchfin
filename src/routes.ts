import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { errorMessage } from './errors.js'
import { dedupeModels } from './models.js'
import { labelFromAuth, type AccountPayload, type AccountStore } from './accounts/store.js'
import type { ChannelDescriptor } from './channels/descriptor.js'
import type { ChannelRegistry } from './channels/registry.js'
import type { HitchfinAdapter } from './adapter/hitchfin-adapter.js'
import type { ChannelModelRecord, ChannelWorkerHost } from './host/worker-host.js'
import type { HitchfinContext, WebRoute } from './types.js'

const PREFIX = '/dsh-hitchfin'
const BODY_LIMIT = 64 * 1024
const LOGIN_TTL_MS = 10 * 60_000

type LoginStatus = 'pending' | 'code' | 'ok' | 'error' | 'cancelled'

/** A login can be cancelled from another request while a callback is in flight. */
function isLoginCancelled(state: LoginState): boolean {
  return state.status === 'cancelled'
}

interface LoginState {
  id: string
  channelId: string
  accountId: string
  workerSession: string
  method: 'auto' | 'code'
  status: LoginStatus
  url?: string
  instructions?: string
  opened?: boolean
  autoOpened?: boolean
  proxy?: string
  error?: string
  account?: AccountPayload
  createdAt: number
}

export interface HitchfinRouteServices {
  registry: ChannelRegistry
  accounts: AccountStore
  worker: ChannelWorkerHost
  adapter: HitchfinAdapter
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(body)
}

function methodRefused(req: IncomingMessage, res: ServerResponse, methods: string[]): boolean {
  const method = req.method ?? 'GET'
  if (methods.includes(method)) return false
  sendJson(res, 405, { ok: false, error: 'method not allowed' })
  return true
}

function fenceRefused(ctx: HitchfinContext, req: IncomingMessage, res: ServerResponse): boolean {
  const connection = ctx.get?.('connection') as
    | { requestRejection?: (req: IncomingMessage) => unknown }
    | undefined
  const rejection = connection?.requestRejection?.(req)
  if (typeof rejection === 'number') {
    sendJson(res, rejection, { ok: false, error: 'request refused' })
    return true
  }

  const remote = req.socket.remoteAddress ?? ''
  const loopback =
    remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1'
  if (!loopback) {
    sendJson(res, 403, { ok: false, error: 'loopback only' })
    return true
  }

  const origin = req.headers.origin
  if (origin === undefined || origin === 'null' || origin === '') {
    return false
  }

  try {
    const originUrl = new URL(origin)
    if (
      originUrl.hostname === '127.0.0.1' ||
      originUrl.hostname === 'localhost' ||
      originUrl.hostname === '::1' ||
      ['dsh:', 'app:', 'vscode-file:', 'vscode-webview:', 'file:'].includes(originUrl.protocol)
    ) {
      return false
    }
    sendJson(res, 403, { ok: false, error: 'origin refused' })
    return true
  } catch {
    sendJson(res, 403, { ok: false, error: 'origin refused' })
    return true
  }
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > BODY_LIMIT) throw new Error('request body too large')
    chunks.push(buffer)
  }
  if (chunks.length === 0) return {}
  const text = Buffer.concat(chunks).toString('utf8')
  if (!text.trim()) return {}
  const parsed = JSON.parse(text) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('request body must be an object')
  }
  return parsed as Record<string, unknown>
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function descriptorOf(
  registry: ChannelRegistry,
  channelId: string,
): ChannelDescriptor | undefined {
  return registry.all().find((descriptor) => descriptor.id === channelId)
}

function publicLogin(state: LoginState): Record<string, unknown> {
  return {
    id: state.id,
    channelId: state.channelId,
    accountId: state.accountId,
    status: state.status,
    method: state.method,
    ...(state.url ? { url: state.url } : {}),
    ...(state.instructions ? { instructions: state.instructions } : {}),
    ...(state.opened ? { opened: true } : {}),
    ...(state.autoOpened ? { autoOpened: true } : {}),
    ...(state.error ? { error: state.error } : {}),
    ...(state.account ? { account: publicAccount(state.account) } : {}),
  }
}

function publicProxy(proxy?: string): Record<string, unknown> {
  if (!proxy) return { proxyConfigured: false }
  try {
    const url = new URL(proxy)
    if (url.username || url.password) {
      url.username = url.username ? '***' : ''
      url.password = ''
    }
    return { proxy: url.toString(), proxyConfigured: true }
  } catch {
    return { proxyConfigured: true }
  }
}

function publicAccount(
  account: AccountPayload,
  modelCount?: number,
  quota?: Record<string, unknown> | null,
  error?: string,
): Record<string, unknown> {
  return {
    accountId: account.accountId,
    label: account.label,
    freeOnly: account.freeOnly,
    hiddenModels: account.hiddenModels ?? [],
    ...(modelCount !== undefined ? { modelCount } : {}),
    ...(quota !== undefined ? { quota } : {}),
    ...(error ? { error } : {}),
    ...publicProxy(account.proxy),
  }
}

function openExternal(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
    const [command, args] =
      process.platform === 'darwin'
        ? ['open', [url]]
        : process.platform === 'win32'
          ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
          : ['xdg-open', [url]]
    const child = spawn(command, args, { detached: true, stdio: 'ignore' })
    child.on('error', () => {})
    child.unref()
    return true
  } catch {
    return false
  }
}

function parseProxy(value: unknown): { proxy?: string; error?: string } {
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { error: 'proxy must start with http:// or https://' }
    }
    return { proxy: url.toString() }
  } catch {
    return { error: 'invalid proxy URL' }
  }
}

function identityOf(auth: unknown): string {
  if (!auth || typeof auth !== 'object' || Array.isArray(auth)) return ''
  const record = auth as Record<string, unknown>
  for (const key of ['accountId', 'uid', 'email']) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return `${key}:${value.trim()}`
  }
  return ''
}

async function resolveAccountId(
  accountStore: AccountStore,
  channelId: string,
  requested: unknown,
): Promise<string> {
  const wanted = typeof requested === 'string' ? requested.trim() : ''
  if (wanted && wanted !== 'new') return wanted
  return accountStore.nextAccountId(channelId)
}

export function registerHitchfinRoutes(
  ctx: HitchfinContext,
  services: HitchfinRouteServices,
): () => void {
  const { registry, accounts, worker, adapter } = services
  const server = ctx.webServer
  if (!server) {
    ctx.logger.warn('dsh-hitchfin: webServer is unavailable; settings routes are disabled')
    return () => {}
  }

  const logins = new Map<string, LoginState>()
  const loginTimers = new Set<NodeJS.Timeout>()

  const trackLogin = (state: LoginState): void => {
    logins.set(state.id, state)
    const timer = setTimeout(() => {
      logins.delete(state.id)
      loginTimers.delete(timer)
    }, LOGIN_TTL_MS)
    timer.unref?.()
    loginTimers.add(timer)
  }

  const modelsChanged = (descriptor: ChannelDescriptor): void => {
    adapter.invalidate(descriptor.providerId)
    ctx.emit?.('llm/models-updated', descriptor.providerId)
  }

  async function saveLoginAccount(
    descriptor: ChannelDescriptor,
    accountId: string,
    auth: unknown,
    proxy?: string,
  ): Promise<AccountPayload> {
    const stored = await accounts.list(descriptor.id).catch(() => [])
    let existing =
      stored.find((entry) => entry.accountId === accountId) ??
      (await accounts.get(descriptor.id, accountId).catch(() => undefined))
    if (!existing) {
      const identity = identityOf(auth)
      if (identity) {
        existing = stored.find((entry) => identityOf(entry.auth) === identity)
      }
    }

    let inheritedFreeOnly = descriptor.freeOnlyDefault
    let inheritedHiddenModels: string[] | undefined
    if (!existing && stored.length > 0) {
      inheritedFreeOnly = stored.every((entry) => entry.freeOnly !== false)
      let intersection = [...(stored[0].hiddenModels ?? [])]
      for (const peer of stored.slice(1)) {
        const peerSet = new Set(peer.hiddenModels ?? [])
        intersection = intersection.filter((id) => peerSet.has(id))
      }
      if (intersection.length > 0) inheritedHiddenModels = intersection
    }

    const resolvedProxy = proxy ?? existing?.proxy
    const resolvedHiddenModels = existing?.hiddenModels ?? inheritedHiddenModels
    const now = Date.now()
    return accounts.save({
      channelId: descriptor.id,
      accountId: existing?.accountId ?? accountId,
      label: existing?.label ?? labelFromAuth(descriptor.displayName, auth),
      auth,
      freeOnly: existing?.freeOnly ?? inheritedFreeOnly,
      ...(existing?.plan ? { plan: existing.plan } : {}),
      ...(resolvedHiddenModels ? { hiddenModels: resolvedHiddenModels } : {}),
      ...(resolvedProxy ? { proxy: resolvedProxy } : {}),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    })
  }

  let unregister: (() => void) | void
  void Promise.resolve(
    server.register({
      kind: 'prefix',
      path: PREFIX,
      handler: (req, res) => {
        void handle(req, res).catch((error) => {
          if (!res.headersSent) {
            sendJson(res, 500, { ok: false, error: errorMessage(error) })
          } else {
            res.destroy()
          }
        })
      },
    }),
  ).then((fn) => {
    if (typeof fn === 'function') unregister = fn
  })

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (fenceRefused(ctx, req, res)) return
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const path = url.pathname.slice(PREFIX.length) || '/'

    if (path === '/state' && !methodRefused(req, res, ['GET', 'HEAD'])) {
      const withQuota = url.searchParams.get('quota') !== '0'
      const channels = await Promise.all(
        registry.all().map(async (descriptor) => {
          let accountList: readonly AccountPayload[] = []
          try {
            accountList = await accounts.list(descriptor.id)
          } catch {
            // Keep the channel visible even if the credential store is unreadable.
          }
          const loadInfo = registry.loadInfo(descriptor)
          const packageAvailable = loadInfo !== undefined

          const views = await Promise.all(
            accountList.map(async (account) => {
              let raw: readonly ChannelModelRecord[] = []
              let quota: Record<string, unknown> | null = null
              let error: string | undefined
              if (loadInfo) {
                try {
                  raw = await worker.models({
                    channel: loadInfo,
                    accountId: account.accountId,
                    auth: account.auth,
                    freeOnly: false,
                    ...(account.proxy ? { proxy: account.proxy } : {}),
                  }, 8_000)
                } catch (cause) {
                  error = errorMessage(cause)
                }
                if (withQuota) {
                  try {
                    quota = (await worker.usage(
                      {
                        channel: loadInfo,
                        accountId: account.accountId,
                        auth: account.auth,
                        ...(account.proxy ? { proxy: account.proxy } : {}),
                      },
                      5_000,
                    )) as unknown as Record<string, unknown>
                  } catch {
                    quota = null
                  }
                }
              }

              const hidden = new Set(account.hiddenModels ?? [])
              const hasFreeMetadata = raw.some((model) => model.freeKnown)
              const usable =
                account.freeOnly !== false && hasFreeMetadata
                  ? raw.filter((model) => model.freeKnown && model.free)
                  : raw
              const visible = dedupeModels(usable).filter((model) => !hidden.has(model.id))
              return { account, raw, visible, quota, error }
            }),
          )

          const mergedVisible = new Map<string, ChannelModelRecord>()
          const mergedAll = new Map<string, ChannelModelRecord>()
          for (const view of views) {
            for (const model of view.visible) {
              const existing = mergedVisible.get(model.id)
              if (!existing || (model.freeKnown && model.free && !existing.free)) {
                mergedVisible.set(model.id, model)
              }
            }
            for (const model of view.raw) {
              const existing = mergedAll.get(model.id)
              mergedAll.set(model.id, {
                ...(existing ?? model),
                free: (existing?.free ?? false) || model.free,
                freeKnown: (existing?.freeKnown ?? false) || model.freeKnown,
              })
            }
          }

          let models = dedupeModels([...mergedVisible.values()]).map((model) => ({
            id: model.id,
            name: model.name,
            free: model.free,
          }))
          let allModels = dedupeModels([...mergedAll.values()]).map((model) => ({
            id: model.id,
            name: model.name,
            free: model.free,
            freeKnown: model.freeKnown,
          }))
          let freeStatusKnown = allModels.some((model) => model.freeKnown)

          if (views.length === 0) {
            try {
              models = (await adapter.listModels(descriptor.providerId)).map((model) => ({
                id: model.id,
                name: model.name,
                free: model.badge?.tone === 'success',
              }))
              allModels = models.map((model) => ({ ...model, freeKnown: false }))
              freeStatusKnown = false
            } catch {
              // A channel whose package is missing lists no models.
            }
          }

          let hiddenModels: string[] = []
          if (accountList.length > 0) {
            hiddenModels = [...(accountList[0].hiddenModels ?? [])]
            for (const account of accountList.slice(1)) {
              const hidden = new Set(account.hiddenModels ?? [])
              hiddenModels = hiddenModels.filter((id) => hidden.has(id))
            }
          }

          return {
            id: descriptor.id,
            providerId: descriptor.providerId,
            displayName: descriptor.displayName,
            status: descriptor.status,
            packageAvailable,
            freeStatusKnown,
            freeOnly:
              accountList.length > 0
                ? accountList.every((entry) => entry.freeOnly !== false)
                : true,
            hiddenModels,
            methods: descriptor.authMethods,
            accounts: views.map((view) =>
              publicAccount(
                view.account,
                view.visible.length,
                withQuota ? view.quota : undefined,
                view.error,
              ),
            ),
            models,
            allModels,
            quota: views[0]?.quota ?? null,
            modelCount: models.length,
          }
        }),
      )
      sendJson(res, 200, { ok: true, channels })
      return
    }

    if (path === '/login/start' && !methodRefused(req, res, ['POST'])) {
      const body = await readJson(req)
      const descriptor = descriptorOf(registry, text(body.channelId))
      if (!descriptor) {
        sendJson(res, 404, { ok: false, error: 'unknown channel' })
        return
      }
      const loadInfo = registry.loadInfo(descriptor)
      if (!loadInfo) {
        sendJson(res, 409, {
          ok: false,
          error: `channel package ${descriptor.packageName} is not installed`,
        })
        return
      }
      const methodIndex =
        typeof body.method === 'number' && Number.isInteger(body.method) ? body.method : 0
      const inputs: Record<string, string> = {}
      if (body.inputs && typeof body.inputs === 'object' && !Array.isArray(body.inputs)) {
        for (const [key, value] of Object.entries(body.inputs).slice(0, 8)) {
          if (typeof value === 'string') inputs[key] = value.slice(0, 4096)
        }
      }
      const parsedProxy = parseProxy(body.proxy)
      if (parsedProxy.error) {
        sendJson(res, 400, { ok: false, error: parsedProxy.error })
        return
      }
      const accountId = await resolveAccountId(accounts, descriptor.id, body.accountId)
      const existing = await accounts.get(descriptor.id, accountId).catch(() => undefined)
      const proxy = parsedProxy.proxy ?? existing?.proxy
      const authMethod = descriptor.authMethods.find((entry) => entry.index === methodIndex)
      try {
        const started = await worker.authorize(loadInfo, accountId, methodIndex, inputs, proxy)
        const autoOpened = Boolean(
          started.url &&
            authMethod?.id === 'browser' &&
            (started.opened === true || openExternal(started.url)),
        )
        const state: LoginState = {
          id: randomUUID(),
          channelId: descriptor.id,
          accountId,
          workerSession: started.session,
          method: started.method === 'code' ? 'code' : 'auto',
          status: started.method === 'code' ? 'code' : 'pending',
          ...(started.url ? { url: started.url } : {}),
          ...(started.instructions ? { instructions: started.instructions } : {}),
          ...(started.opened ? { opened: true } : {}),
          ...(autoOpened ? { autoOpened: true } : {}),
          ...(proxy ? { proxy } : {}),
          createdAt: Date.now(),
        }
        trackLogin(state)
        if (state.status === 'pending') {
          void completeLogin(state, descriptor, loadInfo)
        }
        sendJson(res, 200, { ok: true, login: publicLogin(state) })
      } catch (error) {
        sendJson(res, 500, { ok: false, error: errorMessage(error) })
      }
      return
    }

    if (path === '/login/apikey' && !methodRefused(req, res, ['POST'])) {
      const body = await readJson(req)
      const descriptor = descriptorOf(registry, text(body.channelId))
      if (!descriptor) {
        sendJson(res, 404, { ok: false, error: 'unknown channel' })
        return
      }
      const methodIndex =
        typeof body.method === 'number' && Number.isInteger(body.method) ? body.method : -1
      const method = descriptor.authMethods.find(
        (entry) => entry.index === methodIndex && entry.kind === 'api-key',
      )
      if (!method) {
        sendJson(res, 400, { ok: false, error: 'unknown API key method' })
        return
      }
      const loadInfo = registry.loadInfo(descriptor)
      if (!loadInfo) {
        sendJson(res, 409, {
          ok: false,
          error: `channel package ${descriptor.packageName} is not installed`,
        })
        return
      }
      const key = text(body.key).trim()
      if (!key || key.length > 8192) {
        sendJson(res, 400, { ok: false, error: 'API key is required' })
        return
      }
      const parsedProxy = parseProxy(body.proxy)
      if (parsedProxy.error) {
        sendJson(res, 400, { ok: false, error: parsedProxy.error })
        return
      }
      try {
        const accountId = await resolveAccountId(accounts, descriptor.id, body.accountId)
        const result = await worker.apiKey(loadInfo, accountId, methodIndex, key)
        const account = await saveLoginAccount(
          descriptor,
          accountId,
          result.auth,
          parsedProxy.proxy,
        )
        adapter.forget(descriptor.providerId, account.accountId)
        modelsChanged(descriptor)
        sendJson(res, 200, { ok: true, account: publicAccount(account) })
      } catch (error) {
        sendJson(res, 500, { ok: false, error: errorMessage(error) })
      }
      return
    }

    if (path === '/login/status' && !methodRefused(req, res, ['GET'])) {
      const id = url.searchParams.get('id') ?? ''
      const state = logins.get(id)
      if (!state) {
        sendJson(res, 404, { ok: false, error: 'unknown login' })
        return
      }
      sendJson(res, 200, { ok: true, login: publicLogin(state) })
      return
    }

    if (path === '/login/code' && !methodRefused(req, res, ['POST'])) {
      const body = await readJson(req)
      const state = logins.get(text(body.id))
      const descriptor = state ? descriptorOf(registry, state.channelId) : undefined
      if (!state || !descriptor) {
        sendJson(res, 404, { ok: false, error: 'unknown login' })
        return
      }
      if (state.status !== 'code') {
        sendJson(res, 409, { ok: false, error: 'this login does not wait for a code' })
        return
      }
      const loadInfo = registry.loadInfo(descriptor)
      if (!loadInfo) {
        sendJson(res, 409, { ok: false, error: 'channel package is not installed' })
        return
      }
      state.status = 'pending'
      void completeLogin(state, descriptor, loadInfo, text(body.code))
      sendJson(res, 200, { ok: true, login: publicLogin(state) })
      return
    }

    if (path === '/login/cancel' && !methodRefused(req, res, ['POST'])) {
      const body = await readJson(req)
      const state = logins.get(text(body.id))
      if (!state) {
        sendJson(res, 404, { ok: false, error: 'unknown login' })
        return
      }
      if (state.status === 'pending' || state.status === 'code') {
        worker.cancelAuth(state.workerSession)
        state.status = 'cancelled'
      }
      sendJson(res, 200, { ok: true, login: publicLogin(state) })
      return
    }

    if (path === '/free-only' && !methodRefused(req, res, ['POST'])) {
      const body = await readJson(req)
      const descriptor = descriptorOf(registry, text(body.channelId))
      if (!descriptor) {
        sendJson(res, 404, { ok: false, error: 'unknown channel' })
        return
      }
      const accountId = text(body.accountId)
      if (accountId) {
        await accounts.setFreeOnly(descriptor.id, accountId, body.freeOnly !== false)
      } else {
        await accounts.setChannelFreeOnly(descriptor.id, body.freeOnly !== false)
      }
      modelsChanged(descriptor)
      sendJson(res, 200, { ok: true })
      return
    }

    if (path === '/account/proxy' && !methodRefused(req, res, ['POST'])) {
      const body = await readJson(req)
      const descriptor = descriptorOf(registry, text(body.channelId))
      if (!descriptor) {
        sendJson(res, 404, { ok: false, error: 'unknown channel' })
        return
      }
      const accountId = text(body.accountId)
      if (!accountId) {
        sendJson(res, 400, { ok: false, error: 'accountId is required' })
        return
      }
      const account = await accounts.get(descriptor.id, accountId)
      if (!account) {
        sendJson(res, 404, { ok: false, error: 'unknown account' })
        return
      }
      const parsedProxy = parseProxy(body.proxy)
      if (parsedProxy.error) {
        sendJson(res, 400, { ok: false, error: parsedProxy.error })
        return
      }
      await accounts.setProxy(descriptor.id, accountId, parsedProxy.proxy)
      adapter.forget(descriptor.providerId, accountId)
      modelsChanged(descriptor)
      const updated = (await accounts.get(descriptor.id, accountId)) ?? account
      sendJson(res, 200, { ok: true, account: publicAccount(updated) })
      return
    }

    if (path === '/delete' && !methodRefused(req, res, ['POST'])) {
      const body = await readJson(req)
      const descriptor = descriptorOf(registry, text(body.channelId))
      if (!descriptor) {
        sendJson(res, 404, { ok: false, error: 'unknown channel' })
        return
      }
      const accountId = text(body.accountId)
      if (!accountId) {
        sendJson(res, 400, { ok: false, error: 'accountId is required' })
        return
      }
      await accounts.delete(descriptor.id, accountId)
      adapter.forget(descriptor.providerId, accountId)
      modelsChanged(descriptor)
      sendJson(res, 200, { ok: true })
      return
    }

    if (path === '/models/hidden' && !methodRefused(req, res, ['POST'])) {
      const body = await readJson(req)
      const descriptor = descriptorOf(registry, text(body.channelId))
      if (!descriptor) {
        sendJson(res, 404, { ok: false, error: 'unknown channel' })
        return
      }
      const hidden = Array.isArray(body.hiddenModels)
        ? [
            ...new Set(
              body.hiddenModels
                .filter((value): value is string => typeof value === 'string')
                .map((value) => value.trim())
                .filter(Boolean),
            ),
          ]
        : []
      const accountId = text(body.accountId)
      if (accountId) {
        await accounts.setHiddenModels(descriptor.id, accountId, hidden)
      } else {
        await accounts.setChannelHiddenModels(descriptor.id, hidden)
      }
      modelsChanged(descriptor)
      sendJson(res, 200, { ok: true })
      return
    }

    sendJson(res, 404, { ok: false, error: 'not found' })
  }

  async function completeLogin(
    state: LoginState,
    descriptor: ChannelDescriptor,
    loadInfo: NonNullable<ReturnType<ChannelRegistry['loadInfo']>>,
    code?: string,
  ): Promise<void> {
    if (isLoginCancelled(state)) return
    try {
      const result = await worker.callback(loadInfo, state.workerSession, code, state.proxy)
      // The user may have cancelled while the upstream callback was in flight.
      if (isLoginCancelled(state)) return
      const account = await saveLoginAccount(
        descriptor,
        state.accountId,
        result.auth,
        state.proxy,
      )
      adapter.forget(descriptor.providerId, account.accountId)
      modelsChanged(descriptor)
      state.accountId = account.accountId
      state.status = 'ok'
      state.account = account
    } catch (error) {
      if (isLoginCancelled(state)) return
      state.status = 'error'
      state.error = errorMessage(error)
    }
  }

  return () => {
    for (const timer of loginTimers) clearTimeout(timer)
    loginTimers.clear()
    logins.clear()
    if (typeof unregister === 'function') {
      try {
        unregister()
      } catch {
        // The host may already have torn down its routes.
      }
    }
  }
}
