import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { errorMessage } from './errors.js'
import { dedupeModels } from './models.js'
import type { AccountPayload, AccountStore } from './accounts/store.js'
import type { ChannelDescriptor } from './channels/descriptor.js'
import type { ChannelRegistry } from './channels/registry.js'
import type { HitchfinAdapter } from './adapter/hitchfin-adapter.js'
import type { ChannelWorkerHost } from './host/worker-host.js'
import type { HitchfinContext, WebRoute } from './types.js'

const PREFIX = '/dsh-hitchfin'
const BODY_LIMIT = 64 * 1024

type LoginStatus = 'pending' | 'code' | 'ok' | 'error' | 'cancelled'

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
  if (origin) {
    try {
      const host = new URL(origin).hostname
      if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') {
        sendJson(res, 403, { ok: false, error: 'origin refused' })
        return true
      }
    } catch {
      sendJson(res, 403, { ok: false, error: 'origin refused' })
      return true
    }
  }
  return false
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
    status: state.status,
    method: state.method,
    ...(state.url ? { url: state.url } : {}),
    ...(state.instructions ? { instructions: state.instructions } : {}),
    ...(state.opened ? { opened: true } : {}),
    ...(state.error ? { error: state.error } : {}),
    ...(state.account ? { account: publicAccount(state.account) } : {}),
  }
}

function publicAccount(account: AccountPayload): Record<string, unknown> {
  return {
    accountId: account.accountId,
    label: account.label,
    freeOnly: account.freeOnly,
    hiddenModels: account.hiddenModels ?? [],
  }
}

export function registerHitchfinRoutes(
  ctx: HitchfinContext,
  services: HitchfinRouteServices,
): void {
  const { registry, accounts, worker, adapter } = services
  const server = ctx.webServer
  if (!server) {
    ctx.logger.warn('dsh-hitchfin: webServer is unavailable; settings routes are disabled')
    return
  }

  const logins = new Map<string, LoginState>()

  const modelsChanged = (descriptor: ChannelDescriptor): void => {
    adapter.invalidate(descriptor.providerId)
    ctx.emit?.('llm/models-updated', descriptor.providerId)
  }

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
  )

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (fenceRefused(ctx, req, res)) return
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const path = url.pathname.slice(PREFIX.length) || '/'

    if (path === '/state' && !methodRefused(req, res, ['GET', 'HEAD'])) {
      const withQuota = url.searchParams.get('quota') !== '0'
      const channels = []
      for (const descriptor of registry.all()) {
        let accountList: readonly AccountPayload[] = []
        try {
          accountList = await accounts.list(descriptor.id)
        } catch {
          // Keep the channel visible even if the credential store is unreadable.
        }
        const loadInfo = registry.loadInfo(descriptor)
        const packageAvailable = loadInfo !== undefined
        let models: Array<Record<string, unknown>> = []
        let allModels: Array<Record<string, unknown>> = []
        let quota: Record<string, unknown> | null = null
        const account = accountList[0]
        if (packageAvailable) {
          if (account && loadInfo) {
            try {
              const records = await worker.models({
                channel: loadInfo,
                accountId: account.accountId,
                auth: account.auth,
                freeOnly: false,
              })
              const hidden = new Set(account.hiddenModels ?? [])
              const unique = dedupeModels(records)
              allModels = unique.map((model) => ({
                id: model.id,
                name: model.name,
                free: model.free,
                freeKnown: model.freeKnown,
              }))
              models = (await adapter.listModels(descriptor.providerId)).map((model) => ({
                id: model.id,
                name: model.name,
                free: model.badge?.tone === 'success',
              }))
              if (models.length === 0) {
                // A cache from before a free-only change may still be warming;
                // show what the worker sees rather than an empty configuration.
                const hasFreeMetadata = records.some((model) => model.freeKnown)
                const usable =
                  account.freeOnly !== false && hasFreeMetadata
                    ? records.filter((model) => model.freeKnown && model.free)
                    : records
                models = dedupeModels(usable)
                  .filter((model) => !hidden.has(model.id))
                  .map((model) => ({ id: model.id, name: model.name, free: model.free }))
              }
            } catch {
              // Keep the channel visible; the user can re-login or refresh.
            }
            if (withQuota) {
              try {
                quota = (await worker.usage(
                  {
                    channel: loadInfo,
                    accountId: account.accountId,
                    auth: account.auth,
                  },
                  5_000,
                )) as unknown as Record<string, unknown>
              } catch {
                quota = null
              }
            }
          } else {
            try {
              models = (await adapter.listModels(descriptor.providerId)).map((model) => ({
                id: model.id,
                name: model.name,
                free: model.badge?.tone === 'success',
              }))
              allModels = models
            } catch {
              // A channel whose package is missing lists no models.
            }
          }
        }
        channels.push({
          id: descriptor.id,
          providerId: descriptor.providerId,
          displayName: descriptor.displayName,
          status: descriptor.status,
          packageAvailable,
          freeStatusKnown: allModels.some((model) => model.freeKnown === true),
          freeOnly:
            accountList.length > 0
              ? accountList.every((entry) => entry.freeOnly !== false)
              : true,
          methods: descriptor.authMethods,
          accounts: accountList.map(publicAccount),
          models,
          allModels,
          quota,
          modelCount: models.length,
        })
      }
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
      try {
        const started = await worker.authorize(loadInfo, 'acct-1', methodIndex, inputs)
        const state: LoginState = {
          id: randomUUID(),
          channelId: descriptor.id,
          accountId: 'acct-1',
          workerSession: started.session,
          method: started.method === 'code' ? 'code' : 'auto',
          status: started.method === 'code' ? 'code' : 'pending',
          ...(started.url ? { url: started.url } : {}),
          ...(started.instructions ? { instructions: started.instructions } : {}),
          ...(started.opened ? { opened: true } : {}),
          createdAt: Date.now(),
        }
        logins.set(state.id, state)
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
      try {
        const result = await worker.apiKey(loadInfo, 'acct-1', methodIndex, key)
        const now = Date.now()
        const account: AccountPayload = {
          channelId: descriptor.id,
          accountId: 'acct-1',
          label: descriptor.displayName,
          auth: result.auth,
          freeOnly: descriptor.freeOnlyDefault,
          createdAt: now,
          updatedAt: now,
        }
        await accounts.save(account)
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
      worker.cancelAuth(state.workerSession)
      state.status = 'cancelled'
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
      await accounts.setFreeOnly(descriptor.id, text(body.accountId) || 'acct-1', body.freeOnly !== false)
      modelsChanged(descriptor)
      sendJson(res, 200, { ok: true })
      return
    }

    if (path === '/delete' && !methodRefused(req, res, ['POST'])) {
      const body = await readJson(req)
      const descriptor = descriptorOf(registry, text(body.channelId))
      if (!descriptor) {
        sendJson(res, 404, { ok: false, error: 'unknown channel' })
        return
      }
      await accounts.delete(descriptor.id, text(body.accountId) || 'acct-1')
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
        ? body.hiddenModels.filter((value): value is string => typeof value === 'string')
        : []
      await accounts.setHiddenModels(descriptor.id, text(body.accountId) || 'acct-1', hidden)
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
    try {
      const result = await worker.callback(loadInfo, state.workerSession, code)
      const now = Date.now()
      const account: AccountPayload = {
        channelId: descriptor.id,
        accountId: state.accountId,
        label: descriptor.displayName,
        auth: result.auth,
        freeOnly: descriptor.freeOnlyDefault,
        createdAt: now,
        updatedAt: now,
      }
      await accounts.save(account)
      modelsChanged(descriptor)
      state.status = 'ok'
      state.account = account
    } catch (error) {
      if (state.status === 'cancelled') return
      state.status = 'error'
      state.error = errorMessage(error)
    }
  }
}
