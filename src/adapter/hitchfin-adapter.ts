import { createOpenAiSseTransport } from './openai-sse.js'
import { createAnthropicSseTransport } from './anthropic-sse.js'
import { selectTransportProtocol, type TransportProtocol } from './protocol.js'
import { HitchfinError, errorMessage } from '../errors.js'
import { dedupeModels, selectVisibleModels } from '../models.js'
import { sortAccountsByPriority } from '../accounts/store.js'
import type { AccountStore, AccountPayload } from '../accounts/store.js'
import type { ChannelDescriptor } from '../channels/descriptor.js'
import type { ChannelRegistry } from '../channels/registry.js'
import type {
  ChannelCallOptions,
  ChannelLoadInfo,
  ChannelModelRecord,
  ChannelWorkerHost,
} from '../host/worker-host.js'
import type {
  GenerateOptions,
  HitchfinLlmAdapter,
  LlmFailure,
  LlmModelInfo,
  LlmProviderInfo,
  LlmResolvedModelInfo,
  Logger,
  PreparedAdapterCall,
  StreamChunk,
} from '../types.js'

export const SPIKE_PROVIDER = 'hitchfin-spike'
const SPIKE_MODEL = 'spike-model'

interface ModelRecord extends ChannelModelRecord {
  accountId?: string
}

interface ModelCacheEntry {
  at: number
  models: readonly LlmResolvedModelInfo[]
}

interface CooldownState {
  until: number
  code: string
  message: string
  retryAfterMs?: number
}

const COOLDOWN_MS: Readonly<Record<string, number>> = {
  AUTH: 10 * 60_000,
  QUOTA: 15 * 60_000,
  RATE_LIMIT: 60_000,
  SERVER: 60_000,
  TRANSPORT: 30_000,
  TIMEOUT: 60_000,
  MODEL_NOT_FOUND: 30 * 60_000,
}

const MODEL_SCOPED_COOLDOWN = new Set(['MODEL_NOT_FOUND'])

function accountRouteKey(provider: string, accountId: string): string {
  return `${provider}\0${accountId}`
}

function modelRouteKey(provider: string, accountId: string, model: string): string {
  return `${provider}\0${accountId}\0${model}`
}

function conversationKey(provider: string, model: string, sessionId?: string): string {
  return `${provider}\0${model}\0${sessionId ?? ''}`
}

export interface HitchfinAdapterOptions {
  registry: ChannelRegistry
  accounts: AccountStore
  worker: ChannelWorkerHost
  logger: Logger
  /** Development: show a channel's static model list before sign-in. */
  devStaticModels?: boolean
}

function modelInfo(
  descriptor: ChannelDescriptor,
  record: ModelRecord,
): LlmResolvedModelInfo {
  const free = record.freeKnown && record.free
  return {
    provider: descriptor.providerId,
    id: record.id,
    name: record.name,
    description:
      descriptor.displayName + (descriptor.status === 'experimental' ? ' · Experimental' : ''),
    inputModalities: record.input,
    ...(record.contextWindow !== undefined
      ? { context: { contextWindow: record.contextWindow } }
      : {}),
    ...(record.maxTokens !== undefined ? { defaultMaxTokens: record.maxTokens } : {}),
    ...(record.efforts.length > 0
      ? {
          reasoning: {
            efforts: record.efforts.map((id) => ({ id, name: id })),
          },
        }
      : {}),
    ...(free
      ? { badge: { text: { en: 'Free', zh: '免费' }, tone: 'success' as const } }
      : {}),
  }
}

function failureOf(error: unknown, signal?: AbortSignal): LlmFailure {
  if (signal?.aborted) {
    return { message: 'request aborted', code: 'ABORTED' }
  }
  if (error instanceof HitchfinError) {
    return {
      message: error.message,
      code: error.code,
      ...(error.status !== undefined ? { status: error.status } : {}),
      ...(error.providerRetryAfterMs !== undefined
        ? { providerRetryAfterMs: error.providerRetryAfterMs }
        : {}),
    }
  }
  return { message: errorMessage(error), code: 'SERVER' }
}

/**
 * DSH adapter for the free-subscription channels.
 *
 * The fake spike provider stays available while WorkBuddy/Qoder/Trae are wired
 * in; it keeps the Phase 1 contract test runnable without accounts.
 */
export class HitchfinAdapter implements HitchfinLlmAdapter {
  private readonly cache = new Map<string, ModelCacheEntry>()
  private readonly cooldowns = new Map<string, CooldownState>()
  private readonly sticky = new Map<string, string>()
  /** provider + model -> request/stream protocol, filled while listing models. */
  private readonly protocols = new Map<string, TransportProtocol>()
  /** provider + model -> account ids that actually expose the model. */
  private readonly modelAccounts = new Map<string, Set<string>>()
  /** provider + account -> timestamp of the last successful stream (in memory). */
  private readonly lastUsed = new Map<string, number>()
  /** providers whose last model listing had a partial account failure. */
  private readonly incompleteProviders = new Set<string>()

  constructor(private readonly options: HitchfinAdapterOptions) {}

  invalidate(provider?: string): void {
    if (provider) {
      this.cache.delete(provider)
      this.incompleteProviders.delete(provider)
      const prefix = `${provider}\0`
      for (const key of this.protocols.keys()) {
        if (key.startsWith(prefix)) this.protocols.delete(key)
      }
      for (const key of this.modelAccounts.keys()) {
        if (key.startsWith(prefix)) this.modelAccounts.delete(key)
      }
    } else {
      this.cache.clear()
      this.incompleteProviders.clear()
      this.protocols.clear()
      this.modelAccounts.clear()
    }
  }

  /** Drop routing state after an account is re-authenticated or removed. */
  forget(provider: string, accountId: string): void {
    const accountPrefix = `${provider}\0${accountId}`
    for (const key of this.cooldowns.keys()) {
      if (key === accountPrefix || key.startsWith(`${accountPrefix}\0`)) {
        this.cooldowns.delete(key)
      }
    }
    for (const [key, value] of this.sticky) {
      if (value === accountId && key.startsWith(`${provider}\0`)) {
        this.sticky.delete(key)
      }
    }
  }

  providerInfo(provider: string): LlmProviderInfo {
    if (provider === SPIKE_PROVIDER) {
      return { id: provider, name: 'Hitchfin Spike' }
    }
    const descriptor = this.options.registry.get(provider)
    if (descriptor) return { id: descriptor.providerId, name: descriptor.displayName }
    return { id: provider, name: provider }
  }

  providerRetryPolicy(): undefined {
    return undefined
  }

  private cooldownFor(
    provider: string,
    accountId: string,
    model: string,
    now: number,
  ): CooldownState | undefined {
    const accountState = this.cooldowns.get(accountRouteKey(provider, accountId))
    if (accountState && accountState.until > now) return accountState
    const modelState = this.cooldowns.get(modelRouteKey(provider, accountId, model))
    if (modelState && modelState.until > now) return modelState
    return undefined
  }

  private noteFailure(
    provider: string,
    accountId: string,
    model: string,
    failure: LlmFailure,
  ): void {
    const base = COOLDOWN_MS[failure.code]
    if (base === undefined) return
    const now = Date.now()
    const duration = Math.max(base, failure.providerRetryAfterMs ?? 0)
    const key = MODEL_SCOPED_COOLDOWN.has(failure.code)
      ? modelRouteKey(provider, accountId, model)
      : accountRouteKey(provider, accountId)
    this.cooldowns.set(key, {
      until: now + duration,
      code: failure.code,
      message: failure.message,
      ...(failure.providerRetryAfterMs !== undefined
        ? { retryAfterMs: failure.providerRetryAfterMs }
        : {}),
    })
    if (this.cooldowns.size > 500) {
      for (const [entryKey, state] of this.cooldowns) {
        if (state.until <= now) this.cooldowns.delete(entryKey)
      }
    }
  }

  private rememberRoute(
    provider: string,
    model: string,
    sessionId: string | undefined,
    accountId: string,
  ): void {
    const key = conversationKey(provider, model, sessionId)
    this.sticky.delete(key)
    this.sticky.set(key, accountId)
    this.lastUsed.set(accountRouteKey(provider, accountId), Date.now())
    if (this.sticky.size > 200) {
      const oldest = this.sticky.keys().next().value
      if (oldest !== undefined) this.sticky.delete(oldest)
    }
  }

  /** Observable routing state for one account, used by the settings page. */
  accountStatus(
    provider: string,
    accountId: string,
  ): { lastUsedAt?: number; cooldownUntil?: number; cooldownCode?: string } {
    const now = Date.now()
    const key = accountRouteKey(provider, accountId)
    const out: { lastUsedAt?: number; cooldownUntil?: number; cooldownCode?: string } = {}
    const used = this.lastUsed.get(key)
    if (used !== undefined) out.lastUsedAt = used
    let until = 0
    let code = ''
    for (const [stateKey, state] of this.cooldowns) {
      if (state.until <= now) continue
      if (stateKey === key || stateKey.startsWith(`${key}\0`)) {
        if (state.until > until) {
          until = state.until
          code = state.code
        }
      }
    }
    if (until > 0) {
      out.cooldownUntil = until
      out.cooldownCode = code
    }
    return out
  }

  private async protocolFor(provider: string, model: string): Promise<TransportProtocol> {
    const key = `${provider}\0${model}`
    const cached = this.cache.get(provider)
    const expired = cached !== undefined && Date.now() - cached.at >= 30_000
    if (!this.protocols.has(key) || expired || this.incompleteProviders.has(provider)) {
      await this.listModels(provider)
    }
    return this.protocols.get(key) ?? 'openai-completions'
  }

  private coolingFailure(
    descriptor: ChannelDescriptor,
    provider: string,
    accounts: readonly AccountPayload[],
    model: string,
  ): LlmFailure {
    const now = Date.now()
    let soonest: CooldownState | undefined
    for (const account of accounts) {
      const state = this.cooldownFor(provider, account.accountId, model, now)
      if (state && (!soonest || state.until < soonest.until)) soonest = state
    }
    const wait = Math.max(0, (soonest?.until ?? now) - now)
    const seconds = Math.max(1, Math.ceil(wait / 1000))
    return {
      message:
        `${descriptor.displayName}: ` +
        (accounts.length === 1
          ? `the account is cooling down; retry in ${seconds}s`
          : `all ${accounts.length} accounts are cooling down; retry in ${seconds}s`),
      code: soonest?.code ?? 'RATE_LIMIT',
      ...(wait > 0 ? { providerRetryAfterMs: wait } : {}),
    }
  }

  async listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    if (provider === SPIKE_PROVIDER) {
      return [
        {
          provider,
          id: SPIKE_MODEL,
          name: 'Spike Model',
          description: 'Phase 1 scaffold model',
          inputModalities: ['text'],
          badge: { text: { en: 'Spike', zh: '验证' }, tone: 'info' },
        },
      ]
    }

    const descriptor = this.options.registry.get(provider)
    if (!descriptor) return []

    const cached = this.cache.get(provider)
    if (cached && Date.now() - cached.at < 30_000) {
      return cached.models
    }

    const loadInfo = this.options.registry.loadInfo(descriptor)
    if (!loadInfo) {
      this.options.logger.warn(
        `dsh-hitchfin: channel package ${descriptor.packageName} is not installed`,
      )
      return []
    }

    try {
      const accounts = sortAccountsByPriority(await this.options.accounts.list(descriptor.id))
      const sources: readonly Pick<
        AccountPayload,
        'accountId' | 'auth' | 'freeOnly' | 'hiddenModels' | 'proxy' | 'enabled'
      >[] =
        accounts.length > 0
          ? accounts
          : this.options.devStaticModels
            ? [{ accountId: 'static', auth: undefined, freeOnly: false, hiddenModels: [] }]
            : []

      const byId = new Map<string, ModelRecord>()
      const ownersByModel = new Map<string, Set<string>>()
      let allAccountsListed = true
      for (const account of sources) {
        let models: readonly ChannelModelRecord[]
        try {
          models = await this.options.worker.models({
            channel: loadInfo,
            accountId: account.accountId,
            auth: account.auth,
            freeOnly: account.freeOnly !== false,
            ...(account.proxy ? { proxy: account.proxy } : {}),
          })
        } catch (error) {
          allAccountsListed = false
          this.options.logger.warn(
            `dsh-hitchfin: listing ${descriptor.displayName} models for ${account.accountId} failed: ${errorMessage(error)}`,
          )
          continue
        }
        const selection = selectVisibleModels(
          models,
          new Set(account.hiddenModels ?? []),
          account.freeOnly !== false,
        )
        if (
          account.freeOnly !== false &&
          selection.hasFreeMetadata &&
          selection.candidates.length === 0 &&
          models.length > 0
        ) {
          this.options.logger.warn(
            `dsh-hitchfin: ${descriptor.displayName} has no free model available; hiding ${models.length} model(s) under free-only`,
          )
        }
        for (const model of selection.candidates) {
          if (account.auth !== undefined && account.enabled !== false) {
            let owners = ownersByModel.get(model.id)
            if (!owners) {
              owners = new Set()
              ownersByModel.set(model.id, owners)
            }
            owners.add(account.accountId)
          }
          const existing = byId.get(model.id)
          if (!existing || (model.freeKnown && model.free && !existing.free)) {
            byId.set(model.id, { ...model, accountId: account.accountId })
          }
        }
      }

      const ownerPrefix = `${provider}\0`
      for (const key of this.modelAccounts.keys()) {
        if (key.startsWith(ownerPrefix)) this.modelAccounts.delete(key)
      }
      // A failed account listing would make the ownership index incomplete, so
      // fall back to unrestricted routing instead of excluding a valid account.
      if (allAccountsListed && accounts.length > 0) {
        for (const [id, owners] of ownersByModel) {
          this.modelAccounts.set(`${ownerPrefix}${id}`, owners)
        }
      }

      for (const [id, record] of byId) {
        this.protocols.set(`${provider}\0${id}`, selectTransportProtocol(descriptor, record))
      }

      const models = dedupeModels([...byId.values()]).map((record) =>
        modelInfo(descriptor, record),
      )
      if (allAccountsListed) {
        this.incompleteProviders.delete(provider)
        this.cache.set(provider, { at: Date.now(), models })
      } else {
        this.incompleteProviders.add(provider)
        this.cache.delete(provider)
      }
      return models
    } catch (error) {
      this.options.logger.warn(
        `dsh-hitchfin: listing models for ${descriptor.displayName} failed: ${errorMessage(error)}`,
      )
      return []
    }
  }

  async resolveModel(
    provider: string,
    model: string,
    _signal?: AbortSignal,
  ): Promise<LlmResolvedModelInfo> {
    if (provider === SPIKE_PROVIDER) {
      return {
        provider,
        id: model,
        name: 'Spike Model',
        inputModalities: ['text'],
        context: { contextWindow: 128_000 },
        defaultMaxTokens: 4_096,
      }
    }

    const found = (await this.listModels(provider)).find((entry) => entry.id === model)
    if (found) return found

    const descriptor = this.options.registry.get(provider)
    return {
      provider,
      id: model,
      name: model,
      ...(descriptor
        ? {
            description: descriptor.displayName,
            inputModalities: ['text'] as const,
          }
        : {}),
      context: { contextWindow: 128_000 },
      defaultMaxTokens: 16_384,
    }
  }

  async prepareCall(
    provider: string,
    model: string,
    signal?: AbortSignal,
  ): Promise<PreparedAdapterCall> {
    const info = await this.resolveModel(provider, model, signal)
    return {
      model: info,
      stream: (options: GenerateOptions) => this.stream(options),
    }
  }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    if (options.provider === SPIKE_PROVIDER) {
      yield* this.streamSpike(options)
      return
    }

    const descriptor = this.options.registry.get(options.provider)
    if (!descriptor) {
      yield {
        type: 'finish',
        reason: {
          kind: 'error',
          failure: {
            message: `unknown provider ${options.provider}`,
            code: 'INVALID_REQUEST',
          },
        },
      }
      return
    }

    const loadInfo = this.options.registry.loadInfo(descriptor)
    if (!loadInfo) {
      yield {
        type: 'finish',
        reason: {
          kind: 'error',
          failure: {
            message: `channel package ${descriptor.packageName} is not installed`,
            code: 'SERVER',
          },
        },
      }
      return
    }

    let accountList: readonly AccountPayload[] = []
    try {
      accountList = sortAccountsByPriority(await this.options.accounts.list(descriptor.id))
    } catch (error) {
      this.options.logger.warn(
        `dsh-hitchfin: reading accounts for ${descriptor.displayName} failed: ${errorMessage(error)}`,
      )
    }

    const signedIn = accountList.filter(
      (entry) => entry.auth !== undefined && entry.enabled !== false,
    )
    if (signedIn.length === 0) {
      const allDisabled = accountList.some(
        (entry) => entry.auth !== undefined && entry.enabled === false,
      )
      yield {
        type: 'finish',
        reason: {
          kind: 'error',
          failure: {
            message: allDisabled
              ? `No enabled account for ${descriptor.displayName}; enable one in Settings`
              : `Sign in to ${descriptor.displayName} before using this model`,
            code: 'AUTH',
          },
        },
      }
      return
    }

    const protocol = await this.protocolFor(options.provider, options.model)
    const owners = this.modelAccounts.get(`${options.provider}\0${options.model}`)
    const capable = signedIn.filter((entry) => owners === undefined || owners.has(entry.accountId))
    if (capable.length === 0) {
      yield {
        type: 'finish',
        reason: {
          kind: 'error',
          failure: {
            message: `${descriptor.displayName}: no signed-in account offers model ${options.model}`,
            code: 'MODEL_NOT_FOUND',
          },
        },
      }
      return
    }

    const now = Date.now()
    const stickyId = this.sticky.get(
      conversationKey(options.provider, options.model, options.sessionId),
    )
    const eligible = capable
      .filter(
        (entry) =>
          this.cooldownFor(options.provider, entry.accountId, options.model, now) === undefined,
      )
      .sort(
        (left, right) =>
          Number(right.accountId === stickyId) - Number(left.accountId === stickyId),
      )

    if (eligible.length === 0) {
      yield {
        type: 'finish',
        reason: {
          kind: 'error',
          failure: this.coolingFailure(descriptor, options.provider, capable, options.model),
        },
      }
      return
    }

    let lastFailure: LlmFailure | undefined
    for (const account of eligible) {
      if (options.signal?.aborted) {
        yield {
          type: 'finish',
          reason: { kind: 'aborted', failure: { message: 'request aborted', code: 'ABORTED' } },
        }
        return
      }

      // Each request owns its worker call; a shared "current request" field
      // would cross two concurrent chats.
      const callFetch = (input: string, init: RequestInit) =>
        this.options.worker.fetch(input, init, {
          channel: loadInfo,
          accountId: account.accountId,
          auth: account.auth,
          freeOnly: account.freeOnly !== false,
          model: options.model,
          sessionId: options.sessionId,
          ...(account.proxy ? { proxy: account.proxy } : {}),
        } satisfies ChannelCallOptions & { sessionId?: string })
      const transport =
        protocol === 'anthropic-messages'
          ? createAnthropicSseTransport(callFetch)
          : createOpenAiSseTransport(callFetch)

      let emitted = false
      try {
        const upstream = transport({
          provider: options.provider,
          modelId: options.model,
          messages: options.messages,
          options,
          signal: options.signal,
          sessionId: options.sessionId,
        })
        for await (const chunk of upstream) {
          emitted = true
          yield chunk
        }
        this.rememberRoute(options.provider, options.model, options.sessionId, account.accountId)
        return
      } catch (error) {
        const failure = failureOf(error, options.signal)
        if (failure.code === 'ABORTED') {
          yield { type: 'finish', reason: { kind: 'aborted', failure } }
          return
        }
        this.noteFailure(options.provider, account.accountId, options.model, failure)
        lastFailure = failure
        if (emitted) {
          this.options.logger.warn(
            `dsh-hitchfin: ${descriptor.displayName} stream failed after content on ${account.accountId} (${failure.code})`,
          )
          yield { type: 'finish', reason: { kind: 'error', failure } }
          return
        }
        this.options.logger.warn(
          `dsh-hitchfin: ${descriptor.displayName} account ${account.accountId} failed (${failure.code}); trying another account`,
        )
      }
    }

    yield {
      type: 'finish',
      reason: {
        kind: 'error',
        failure:
          lastFailure ?? {
            message: `${descriptor.displayName}: no account accepted the request`,
            code: 'SERVER',
          },
      },
    }
  }

  private async *streamSpike(options: GenerateOptions): AsyncIterable<StreamChunk> {
    if (options.signal?.aborted) {
      yield {
        type: 'finish',
        reason: { kind: 'aborted', failure: { message: 'aborted', code: 'ABORTED' } },
      }
      return
    }

    const text = 'hello from hitchfin scaffold'
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text }
    yield { type: 'block-end', index: 0, block: { type: 'text', text } }
    yield {
      type: 'usage',
      usage: { inputTokens: 1, outputTokens: 4, totalTokens: 5 },
    }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}
