import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { errorMessage } from './errors.js'
import { canonicalHiddenNames, dedupeModels, selectVisibleModels } from './models.js'
import {
  accountIdentity,
  isValidAccountId,
  labelFromAuth,
  sortAccountsByPriority,
  type AccountPayload,
  type AccountStore,
} from './accounts/store.js'
import type { ChannelDescriptor } from './channels/descriptor.js'
import type { ChannelRegistry } from './channels/registry.js'
import type { HitchfinAdapter } from './adapter/hitchfin-adapter.js'
import {
  readModelListing,
  type ChannelModelRecord,
  type ChannelWorkerHost,
} from './host/worker-host.js'
import type { HitchfinContext, WebRoute } from './types.js'

const PREFIX = '/dsh-hitchfin'
const BODY_LIMIT = 64 * 1024
const DEFAULT_LOGIN_TTL_MS = 10 * 60_000

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

interface StateProbe {
  raw: readonly ChannelModelRecord[]
  error?: string
  liveFailed: boolean
}

interface ListingCacheEntry {
  at: number
  signature: string
  probes: Map<string, StateProbe>
}

interface QuotaCacheEntry {
  at: number
  signature: string
  value: Record<string, unknown> | null
}

/** Settings reads share one short-lived vendor snapshot per channel. */
const STATE_TTL_MS = 30_000

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

function isLoopbackHostname(hostname: string): boolean {
  const value = hostname.toLowerCase()
  return (
    value === '127.0.0.1' ||
    value === 'localhost' ||
    value === 'localhost.' ||
    value === '::1' ||
    value === '[::1]'
  )
}

function fenceRefused(ctx: HitchfinContext, req: IncomingMessage, res: ServerResponse): boolean {
  const connection = ctx.get?.('connection') as
    | { requestRejection?: (req: IncomingMessage) => unknown }
    | undefined
  // Only a host that actually exposes requestRejection owns the Host-header
  // fence. A `connection` service without that hook does not: treating its mere
  // presence as proof of a fence used to let a rebinding domain straight
  // through to every settings route.
  const hasHostFence = typeof connection?.requestRejection === 'function'
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

  // Without the host's Connection fence, validate Host as well: a browser
  // tricked into resolving an attacker domain to loopback must not reach a
  // route that trusts "remoteAddress is loopback" alone.
  if (!hasHostFence && typeof req.headers.host === 'string' && req.headers.host.length > 0) {
    try {
      const hostname = new URL(`http://${req.headers.host}`).hostname
      if (!isLoopbackHostname(hostname)) {
        sendJson(res, 403, { ok: false, error: 'host refused' })
        return true
      }
    } catch {
      sendJson(res, 403, { ok: false, error: 'host refused' })
      return true
    }
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

/** A malformed request from the settings page, reported as 400 rather than 500. */
class BadRequestError extends Error {}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const header = req.headers['content-type']
  const contentType = typeof header === 'string' ? header : ''
  // A sandboxed page or an HTML form can only send text/plain without a CORS
  // preflight, so it is the one content type a settings write must refuse.
  if (contentType.startsWith('text/plain')) throw new BadRequestError('unsupported content type')
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > BODY_LIMIT) throw new BadRequestError('request body too large')
    chunks.push(buffer)
  }
  if (chunks.length === 0) return {}
  const text = Buffer.concat(chunks).toString('utf8')
  if (!text.trim()) return {}
  const parsed = JSON.parse(text) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new BadRequestError('request body must be an object')
  }
  return parsed as Record<string, unknown>
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** Settings booleans must be real booleans: "false" and 0 are client bugs. */
function booleanField(
  value: unknown,
  field: string,
  fallback: boolean,
): { value: boolean } | { error: string } {
  if (value === undefined) return { value: fallback }
  if (typeof value !== 'boolean') return { error: `${field} must be a boolean` }
  return { value }
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
    // Query strings and fragments can carry proxy credentials too; the
    // settings page only needs the endpoint.
    url.search = ''
    url.hash = ''
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

async function resolveAccountId(
  accountStore: AccountStore,
  channelId: string,
  requested: unknown,
): Promise<string> {
  const wanted = typeof requested === 'string' ? requested.trim() : ''
  if (wanted && wanted !== 'new') return wanted
  return accountStore.nextAccountId(channelId)
}

export interface HitchfinRouteOptions {
  /** Tests shorten this; production keeps the ten-minute login window. */
  loginTtlMs?: number
}

export function registerHitchfinRoutes(
  ctx: HitchfinContext,
  services: HitchfinRouteServices,
  options: HitchfinRouteOptions = {},
): () => void {
  const { registry, accounts, worker, adapter } = services
  const loginTtlMs = options.loginTtlMs ?? DEFAULT_LOGIN_TTL_MS
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
      loginTimers.delete(timer)
      if (logins.get(state.id) !== state) return
      // The HTTP state expiring is also the end of the worker-side attempt:
      // without this the browser/loopback session could stay alive forever and
      // a late callback could still write an account the UI never saw.
      if (state.status === 'pending' || state.status === 'code') {
        state.status = 'cancelled'
        try {
          worker.cancelAuth(state.workerSession)
        } catch {
          // The worker may already be stopping.
        }
      }
      logins.delete(state.id)
    }, loginTtlMs)
    timer.unref?.()
    loginTimers.add(timer)
  }

  // A settings refresh used to issue a live catalog read and a usage read for
  // every account, twice per user action (quota=0 then quota=1), with no cache.
  // Share one short-lived snapshot per channel and single-flight concurrent
  // reads; account settings are still applied fresh on every response.
  const listingCache = new Map<string, ListingCacheEntry>()
  const listingInflight = new Map<string, Promise<Map<string, StateProbe>>>()
  const quotaCache = new Map<string, QuotaCacheEntry>()
  const quotaInflight = new Map<string, Promise<Record<string, unknown> | null>>()

  /** Anything that changes what the vendor would answer invalidates a probe. */
  const stateSignature = (accountList: readonly AccountPayload[]): string =>
    accountList
      .map((account) =>
        [
          account.accountId,
          account.updatedAt,
          account.enabled !== false ? 1 : 0,
          account.proxy ?? '',
        ].join(':'),
      )
      .join('|')

  const probeOptions = (
    loadInfo: NonNullable<ReturnType<ChannelRegistry['loadInfo']>>,
    account: AccountPayload,
  ) => ({
    channel: loadInfo,
    accountId: account.accountId,
    auth: account.auth,
    ...(account.proxy ? { proxy: account.proxy } : {}),
  })

  async function cachedListings(
    descriptor: ChannelDescriptor,
    accountList: readonly AccountPayload[],
    loadInfo: ReturnType<ChannelRegistry['loadInfo']>,
  ): Promise<Map<string, StateProbe>> {
    const key = descriptor.id
    const signature = stateSignature(accountList)
    const cached = listingCache.get(key)
    if (cached && cached.signature === signature && Date.now() - cached.at < STATE_TTL_MS) {
      return cached.probes
    }
    const inflight = listingInflight.get(key)
    if (inflight) return inflight

    const task = (async () => {
      const probes = new Map<string, StateProbe>()
      if (loadInfo) {
        await Promise.all(
          accountList
            .filter((account) => account.enabled !== false)
            .map(async (account) => {
              let raw: readonly ChannelModelRecord[] = []
              let error: string | undefined
              let liveFailed = false
              try {
                const listing = await readModelListing(
                  worker,
                  { ...probeOptions(loadInfo, account), freeOnly: false },
                  8_000,
                )
                // Never let a placeholder table through, even if an older
                // worker still returns one alongside the failure flag.
                raw = listing.liveFailed ? [] : listing.models
                if (listing.liveFailed) {
                  liveFailed = true
                  error = listing.error ?? 'live model catalog unavailable'
                }
              } catch (cause) {
                liveFailed = true
                error = errorMessage(cause)
              }
              probes.set(account.accountId, { raw, error, liveFailed })
            }),
        )
      }
      listingCache.set(key, { at: Date.now(), signature, probes })
      return probes
    })()
    listingInflight.set(key, task)
    try {
      return await task
    } finally {
      if (listingInflight.get(key) === task) listingInflight.delete(key)
    }
  }

  async function cachedQuotas(
    descriptor: ChannelDescriptor,
    accountList: readonly AccountPayload[],
    loadInfo: ReturnType<ChannelRegistry['loadInfo']>,
  ): Promise<Map<string, Record<string, unknown> | null>> {
    const out = new Map<string, Record<string, unknown> | null>()
    if (!loadInfo) return out
    const signature = stateSignature(accountList)
    await Promise.all(
      accountList
        .filter((account) => account.enabled !== false)
        .map(async (account) => {
          const key = `${descriptor.id}\0${account.accountId}`
          const cached = quotaCache.get(key)
          if (cached && cached.signature === signature && Date.now() - cached.at < STATE_TTL_MS) {
            out.set(account.accountId, cached.value)
            return
          }
          const inflight = quotaInflight.get(key)
          if (inflight) {
            out.set(account.accountId, await inflight)
            return
          }
          const task = (async () => {
            let value: Record<string, unknown> | null = null
            try {
              value = (await worker.usage(probeOptions(loadInfo, account), 5_000)) as unknown as
                | Record<string, unknown>
                | null
            } catch {
              value = null
            }
            quotaCache.set(key, { at: Date.now(), signature, value })
            return value
          })()
          quotaInflight.set(key, task)
          try {
            out.set(account.accountId, await task)
          } finally {
            if (quotaInflight.get(key) === task) quotaInflight.delete(key)
          }
        }),
    )
    return out
  }

  const modelsChanged = (descriptor: ChannelDescriptor): void => {
    listingCache.delete(descriptor.id)
    for (const key of quotaCache.keys()) {
      if (key.startsWith(`${descriptor.id}\0`)) quotaCache.delete(key)
    }
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
      const identity = accountIdentity(auth)
      if (identity) {
        existing = stored.find((entry) => accountIdentity(entry.auth) === identity)
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
      ...(typeof existing?.enabled === 'boolean' ? { enabled: existing.enabled } : {}),
      ...(existing
        ? existing.priority !== undefined
          ? { priority: existing.priority }
          : {}
        : { priority: stored.length, enabled: true }),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    })
  }

  // `webServer.register` is synchronous and returns its disposer. Resolving it
  // through a promise used to leave the route registered when disposal ran in
  // the same tick as registration.
  const registered = server.register({
    kind: 'prefix',
    path: PREFIX,
    handler: (req, res) => {
      void handle(req, res).catch((error) => {
        if (!res.headersSent) {
          sendJson(res, error instanceof BadRequestError ? 400 : 500, {
            ok: false,
            error: errorMessage(error),
          })
        } else {
          res.destroy()
        }
      })
    },
  })
  const unregister = typeof registered === 'function' ? registered : undefined

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
            accountList = sortAccountsByPriority(await accounts.list(descriptor.id))
          } catch {
            // Keep the channel visible even if the credential store is unreadable.
          }
          const loadInfo = registry.loadInfo(descriptor)
          const packageAvailable = loadInfo !== undefined
          const packageInfo = registry.packageInfo?.(descriptor)

          const probes = await cachedListings(descriptor, accountList, loadInfo)
          const quotas = withQuota
            ? await cachedQuotas(descriptor, accountList, loadInfo)
            : new Map<string, Record<string, unknown> | null>()
          const views = accountList.map((account) => {
            const probe = probes.get(account.accountId) ?? {
              raw: [] as readonly ChannelModelRecord[],
              liveFailed: false,
            }
            const quota = withQuota ? (quotas.get(account.accountId) ?? null) : null
            const selection = selectVisibleModels(
              probe.raw,
              new Set(account.hiddenModels ?? []),
              account.freeOnly !== false,
              descriptor.supportsFreeWindow,
            )
            return {
              account,
              raw: probe.raw,
              visible: selection.models,
              candidates: selection.candidates,
              quota,
              error: probe.error,
              liveFailed: probe.liveFailed,
            }
          })

          const mergedVisible = new Map<string, ChannelModelRecord>()
          const mergedAll = new Map<string, ChannelModelRecord>()
          for (const view of views) {
            for (const model of view.candidates) {
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

          // A failed live read must not look like a healthy (empty or
          // placeholder) catalog. Report it, and keep the last good catalog
          // visible in the settings page so a transient vendor hiccup does not
          // wipe the user's model list without explanation.
          const modelsError = views.some((view) => view.liveFailed)
            ? (views.find((view) => view.error)?.error ?? 'live model catalog unavailable')
            : undefined
          if (modelsError && models.length === 0) {
            try {
              const cached = adapter.cachedModels(descriptor.providerId)
              if (cached.length > 0) {
                models = cached.map((model) => ({
                  id: model.id,
                  name: model.name,
                  free: model.badge?.tone === 'success',
                }))
                allModels = models.map((model) => ({ ...model, freeKnown: false }))
                freeStatusKnown = false
              }
            } catch {
              // The adapter may not have a cached catalog yet.
            }
          }

          // Channel-level settings describe the accounts that actually route.
          // A disabled account keeps its own copy but must not decide the
          // toggle (or the hidden intersection) for the enabled ones.
          const settingAccounts = accountList.filter((account) => account.enabled !== false)
          const channelAccounts = settingAccounts.length > 0 ? settingAccounts : accountList
          const hiddenModels = canonicalHiddenNames(
            mergedAll,
            channelAccounts.map((account) => account.hiddenModels ?? []),
          )

          return {
            id: descriptor.id,
            providerId: descriptor.providerId,
            displayName: descriptor.displayName,
            status: descriptor.status,
            packageAvailable,
            ...(packageInfo
              ? {
                  packageVersion: packageInfo.version ?? null,
                  packageExpectedVersion: packageInfo.expectedVersion,
                  packageVersionMismatch: packageInfo.versionMatches === false,
                  packageSource: packageInfo.source,
                }
              : {}),
            freeStatusKnown,
            ...(modelsError ? { modelsError } : {}),
            freeMetadataExpected: descriptor.supportsFreeWindow,
            freeOnly:
              channelAccounts.length > 0
                ? channelAccounts.every((entry) => entry.freeOnly !== false)
                : true,
            hiddenModels,
            methods: descriptor.authMethods,
            accounts: views.map((view, index) => ({
              ...publicAccount(
                view.account,
                view.visible.length,
                withQuota ? view.quota : undefined,
                view.error,
              ),
              enabled: view.account.enabled !== false,
              priority: view.account.priority ?? null,
              isPrimary:
                view.account.enabled !== false &&
                index === views.findIndex((item) => item.account.enabled !== false),
              ...adapter.accountStatus(descriptor.providerId, view.account.accountId),
            })),
            models,
            allModels,
            // Usage belongs to individual accounts; no channel-level aggregate.
            quota: null,
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
      const authMethod = descriptor.authMethods.find((entry) => entry.index === methodIndex)
      // Never fall through to an auth method the product deliberately hid
      // (WorkBuddy's sealed desktop sign-in is still package index 1).
      if (!authMethod || authMethod.kind === 'api-key') {
        sendJson(res, 400, { ok: false, error: 'unknown sign-in method' })
        return
      }
      const inputs: Record<string, string> = {}
      if (body.inputs && typeof body.inputs === 'object' && !Array.isArray(body.inputs)) {
        for (const [key, value] of Object.entries(body.inputs).slice(0, 8)) {
          if (typeof value === 'string') inputs[key] = value.slice(0, 4096)
        }
      }
      const requestedAccountId = text(body.accountId).trim()
      if (
        requestedAccountId &&
        requestedAccountId !== 'new' &&
        !isValidAccountId(requestedAccountId)
      ) {
        sendJson(res, 400, { ok: false, error: 'invalid accountId' })
        return
      }
      const parsedProxy = parseProxy(body.proxy)
      if (parsedProxy.error) {
        sendJson(res, 400, { ok: false, error: parsedProxy.error })
        return
      }
      const accountId = await resolveAccountId(accounts, descriptor.id, requestedAccountId)
      const existing = await accounts.get(descriptor.id, accountId).catch(() => undefined)
      const proxy = parsedProxy.proxy ?? existing?.proxy
      try {
        const started = await worker.authorize(loadInfo, accountId, methodIndex, inputs, proxy)
        const autoOpened = Boolean(
          started.url &&
            authMethod.id === 'browser' &&
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
      const requestedAccountId = text(body.accountId).trim()
      if (
        requestedAccountId &&
        requestedAccountId !== 'new' &&
        !isValidAccountId(requestedAccountId)
      ) {
        sendJson(res, 400, { ok: false, error: 'invalid accountId' })
        return
      }
      try {
        const accountId = await resolveAccountId(accounts, descriptor.id, requestedAccountId)
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
        try {
          worker.cancelAuth(state.workerSession)
        } catch {
          // The worker may already be stopping; the state still turns cancelled.
        }
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
      const freeOnly = booleanField(body.freeOnly, 'freeOnly', true)
      if ('error' in freeOnly) {
        sendJson(res, 400, { ok: false, error: freeOnly.error })
        return
      }
      if (accountId) {
        const account = await accounts.get(descriptor.id, accountId)
        if (!account) {
          sendJson(res, 404, { ok: false, error: 'unknown account' })
          return
        }
        await accounts.setFreeOnly(descriptor.id, accountId, freeOnly.value)
      } else {
        await accounts.setChannelFreeOnly(descriptor.id, freeOnly.value)
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

    if (path === '/account/enabled' && !methodRefused(req, res, ['POST'])) {
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
      try {
        const account = await accounts.get(descriptor.id, accountId)
        if (!account) {
          sendJson(res, 404, { ok: false, error: 'unknown account' })
          return
        }
        const enabled = booleanField(body.enabled, 'enabled', true)
        if ('error' in enabled) {
          sendJson(res, 400, { ok: false, error: enabled.error })
          return
        }
        await accounts.setEnabled(descriptor.id, accountId, enabled.value)
        adapter.forget(descriptor.providerId, accountId)
        modelsChanged(descriptor)
        sendJson(res, 200, { ok: true })
      } catch (error) {
        sendJson(res, 500, { ok: false, error: errorMessage(error) })
      }
      return
    }

    if (path === '/account/order' && !methodRefused(req, res, ['POST'])) {
      const body = await readJson(req)
      const descriptor = descriptorOf(registry, text(body.channelId))
      if (!descriptor) {
        sendJson(res, 404, { ok: false, error: 'unknown channel' })
        return
      }
      const ids = Array.isArray(body.accountIds)
        ? [
            ...new Set(
              body.accountIds
                .filter((value): value is string => typeof value === 'string' && value.trim() !== '')
                .map((value) => value.trim()),
            ),
          ]
        : []
      if (ids.length === 0) {
        sendJson(res, 400, { ok: false, error: 'accountIds is required' })
        return
      }
      try {
        await accounts.setPriorities(descriptor.id, ids)
        adapter.invalidate(descriptor.providerId)
        sendJson(res, 200, { ok: true })
      } catch (error) {
        sendJson(res, 500, { ok: false, error: errorMessage(error) })
      }
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
        const account = await accounts.get(descriptor.id, accountId)
        if (!account) {
          sendJson(res, 404, { ok: false, error: 'unknown account' })
          return
        }
        await accounts.setHiddenModels(descriptor.id, accountId, hidden)
      } else {
        await accounts.setChannelHiddenModels(descriptor.id, hidden)
      }
      modelsChanged(descriptor)
      sendJson(res, 200, { ok: true })
      return
    }

    // Force a fresh catalog read. The Trae package caches a failed read inside
    // its plugin instance for five minutes; dropping that instance gives the
    // next read a clean `readAt` map without restarting the whole worker.
    if (path === '/models/refresh' && !methodRefused(req, res, ['POST'])) {
      const body = await readJson(req)
      const descriptor = descriptorOf(registry, text(body.channelId))
      if (!descriptor) {
        sendJson(res, 404, { ok: false, error: 'unknown channel' })
        return
      }
      const loadInfo = registry.loadInfo(descriptor)
      if (!loadInfo) {
        sendJson(res, 409, { ok: false, error: 'channel package is not installed' })
        return
      }
      try {
        await worker.reloadChannel?.(loadInfo)
      } catch (error) {
        sendJson(res, 502, { ok: false, error: errorMessage(error) })
        return
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
      if (isLoginCancelled(state)) {
        // The credentials landed before the cancel arrived. Keep the account
        // usable, but do not report a sign-in the user cancelled.
        adapter.forget(descriptor.providerId, account.accountId)
        modelsChanged(descriptor)
        return
      }
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
