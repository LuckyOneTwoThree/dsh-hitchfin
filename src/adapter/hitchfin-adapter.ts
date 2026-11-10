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
  ImageAttachmentRef,
  ImageRequestTarget,
  LlmFailure,
  LlmModelInfo,
  LlmProviderInfo,
  LlmResolvedModelInfo,
  Logger,
  PreparedAdapterCall,
  RequestContentBlock,
  RequestMessage,
  StreamChunk,
} from '../types.js'

export const SPIKE_PROVIDER = 'hitchfin-spike'
const SPIKE_MODEL = 'spike-model'

interface ModelRecord extends ChannelModelRecord {
  accountId?: string
}

type ModelSource = Pick<
  AccountPayload,
  'accountId' | 'auth' | 'freeOnly' | 'hiddenModels' | 'proxy' | 'enabled'
>

interface AccountListing {
  account: ModelSource
  models: readonly ChannelModelRecord[]
  error?: unknown
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
  /**
   * Read one durable image attachment into the bytes a model request carries.
   * Supplied when the host mounts its attachment service; without it the
   * catalog stops advertising image input instead of silently losing images.
   */
  readImage?: (
    ref: ImageAttachmentRef,
    signal?: AbortSignal,
  ) => Promise<{ data: Uint8Array; mediaType: string }>
  /** Whether the host currently exposes the attachment reader at all. */
  canReadImages?: () => boolean
}

function modelInfo(
  descriptor: ChannelDescriptor,
  record: ModelRecord,
  includeImages: boolean,
): LlmResolvedModelInfo {
  const free = record.freeKnown && record.free
  const input = includeImages
    ? record.input
    : record.input.filter((modality) => modality !== 'image')
  return {
    provider: descriptor.providerId,
    id: record.id,
    name: record.name,
    description:
      descriptor.displayName + (descriptor.status === 'experimental' ? ' · Experimental' : ''),
    inputModalities: input.length > 0 ? input : ['text'],
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
  /** provider + account -> model ids that account may actually receive. */
  private readonly accountModels = new Map<string, Set<string>>()
  /** providers whose last model listing completed and may be trusted as a whole. */
  private readonly completeCatalogs = new Set<string>()
  /** consecutive incomplete listings, used for a short negative cache. */
  private readonly incompleteAttempts = new Map<string, number>()
  /** provider -> timestamp before which an incomplete listing is not retried. */
  private readonly incompleteRetryAt = new Map<string, number>()
  /** provider + account -> timestamp of the last successful stream (in memory). */
  private readonly lastUsed = new Map<string, number>()
  /** providers whose last model listing had a partial account failure. */
  private readonly incompleteProviders = new Set<string>()

  constructor(private readonly options: HitchfinAdapterOptions) {}

  invalidate(provider?: string): void {
    if (provider) {
      this.cache.delete(provider)
      this.incompleteProviders.delete(provider)
      this.completeCatalogs.delete(provider)
      this.incompleteAttempts.delete(provider)
      this.incompleteRetryAt.delete(provider)
      const prefix = `${provider}\0`
      for (const key of this.protocols.keys()) {
        if (key.startsWith(prefix)) this.protocols.delete(key)
      }
      for (const key of this.modelAccounts.keys()) {
        if (key.startsWith(prefix)) this.modelAccounts.delete(key)
      }
      for (const key of this.accountModels.keys()) {
        if (key.startsWith(prefix)) this.accountModels.delete(key)
      }
    } else {
      this.cache.clear()
      this.incompleteProviders.clear()
      this.completeCatalogs.clear()
      this.incompleteAttempts.clear()
      this.incompleteRetryAt.clear()
      this.protocols.clear()
      this.modelAccounts.clear()
      this.accountModels.clear()
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

  /** This adapter is not an image-billed route; the host token meter falls back. */
  imageRequestPricing(_provider: string, _model: string): undefined {
    return undefined
  }

  /** Preserve the normalized request image; the channel package may shrink it. */
  imageRequestTarget(
    _provider: string,
    _model: string,
    image: ImageAttachmentRef,
  ): ImageRequestTarget {
    return { width: image.width, height: image.height, maxBytes: image.bytes }
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

  /** Whether this route can actually turn a durable image into request bytes. */
  private imagesAvailable(): boolean {
    return this.options.readImage !== undefined && (this.options.canReadImages?.() ?? true)
  }

  private async protocolFor(provider: string, model: string): Promise<TransportProtocol> {
    const key = `${provider}\0${model}`
    const cached = this.cache.get(provider)
    const expired = cached !== undefined && Date.now() - cached.at >= 30_000
    const incomplete = this.incompleteProviders.has(provider)
    const backoffUntil = this.incompleteRetryAt.get(provider) ?? 0
    // A broken account used to force a full listing before every single
    // stream. Keep one immediate retry, then wait out a short negative cache
    // instead of paying every listing timeout again.
    const mayRelist = !incomplete || Date.now() >= backoffUntil
    if (!this.protocols.has(key) || expired || (incomplete && mayRelist)) {
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
      // A disabled account keeps its credentials, proxy and visibility
      // settings, but it no longer offers models: listing it would show a
      // model in the picker that no enabled account can serve.
      const activeAccounts = accounts.filter((account) => account.enabled !== false)
      const sources: readonly ModelSource[] =
        activeAccounts.length > 0
          ? activeAccounts
          : accounts.length === 0 && this.options.devStaticModels
            ? [{ accountId: 'static', auth: undefined, freeOnly: false, hiddenModels: [] }]
            : []

      const byId = new Map<string, ModelRecord>()
      const ownersByModel = new Map<string, Set<string>>()
      const perAccount = new Map<string, Set<string>>()
      let allAccountsListed = true

      // One slow account must not serialize the whole catalog; the worker
      // already time-bounds each listing, so run them together.
      const listings = await Promise.all(
        sources.map(async (account): Promise<AccountListing> => {
          try {
            const models = await this.options.worker.models({
              channel: loadInfo,
              accountId: account.accountId,
              auth: account.auth,
              freeOnly: account.freeOnly !== false,
              ...(account.proxy ? { proxy: account.proxy } : {}),
            })
            return { account, models }
          } catch (error) {
            return { account, models: [], error }
          }
        }),
      )

      for (const { account, models, error } of listings) {
        if (error !== undefined) {
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
          descriptor.supportsFreeWindow,
        )
        if (
          account.freeOnly !== false &&
          selection.candidates.length === 0 &&
          models.length > 0
        ) {
          this.options.logger.warn(
            `dsh-hitchfin: ${descriptor.displayName} ${
              selection.hasFreeMetadata
                ? 'has no free model available'
                : 'returned no free/paid metadata'
            }; hiding ${models.length} model(s) under free-only`,
          )
        }
        if (account.auth !== undefined) {
          perAccount.set(
            `${provider}\0${account.accountId}`,
            new Set(selection.candidates.map((model) => model.id)),
          )
        }
        for (const model of selection.candidates) {
          if (account.auth !== undefined) {
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
      for (const map of [this.modelAccounts, this.accountModels]) {
        for (const key of map.keys()) {
          if (key.startsWith(ownerPrefix)) map.delete(key)
        }
      }
      // A failed account listing would make the ownership index incomplete, so
      // fall back to unrestricted routing instead of excluding a valid account.
      if (allAccountsListed && accounts.length > 0) {
        // A model in a complete catalog that no enabled account owns becomes an
        // explicit empty set. `stream()` reads that as MODEL_NOT_FOUND, while a
        // missing entry (incomplete listing) still means "ownership unknown".
        for (const id of byId.keys()) {
          this.modelAccounts.set(
            `${ownerPrefix}${id}`,
            new Set(ownersByModel.get(id) ?? []),
          )
        }
        for (const [key, ids] of perAccount) this.accountModels.set(key, ids)
      }

      for (const [id, record] of byId) {
        this.protocols.set(`${provider}\0${id}`, selectTransportProtocol(descriptor, record))
      }

      const models = dedupeModels([...byId.values()]).map((record) =>
        modelInfo(descriptor, record, this.imagesAvailable()),
      )
      if (allAccountsListed) {
        this.incompleteProviders.delete(provider)
        this.incompleteAttempts.delete(provider)
        this.incompleteRetryAt.delete(provider)
        this.completeCatalogs.add(provider)
        this.cache.set(provider, { at: Date.now(), models })
      } else {
        const attempts = (this.incompleteAttempts.get(provider) ?? 0) + 1
        this.incompleteAttempts.set(provider, attempts)
        this.incompleteProviders.add(provider)
        this.completeCatalogs.delete(provider)
        // Allow one immediate retry, then stop paying every listing timeout
        // before each stream for a persistently broken account.
        this.incompleteRetryAt.set(provider, attempts <= 1 ? 0 : Date.now() + 10_000)
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
    const catalogKey = `${options.provider}\0${options.model}`
    const owners = this.modelAccounts.get(catalogKey)
    if (this.completeCatalogs.has(options.provider) && owners === undefined) {
      yield {
        type: 'finish',
        reason: {
          kind: 'error',
          failure: {
            message: `${descriptor.displayName}: model ${options.model} is not offered by any enabled account`,
            code: 'MODEL_NOT_FOUND',
          },
        },
      }
      return
    }
    const capable = signedIn.filter((entry) => {
      if (owners !== undefined && !owners.has(entry.accountId)) return false
      const allowed = this.accountModels.get(
        `${options.provider}\0${entry.accountId}`,
      )
      // A missing per-account entry means the catalog is incomplete for that
      // account (fall back to unrestricted); a present set enforces the
      // account's free-only and hidden-model settings at request time.
      return allowed === undefined || allowed.has(options.model)
    })
    if (capable.length === 0) {
      yield {
        type: 'finish',
        reason: {
          kind: 'error',
          failure: {
            message: `${descriptor.displayName}: no enabled account offers model ${options.model} under its current settings`,
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

    let messages: readonly RequestMessage[] = options.messages
    try {
      messages = await this.projectImages(options.messages, options.signal)
    } catch (error) {
      yield {
        type: 'finish',
        reason: {
          kind: 'error',
          failure: failureOf(
            error instanceof HitchfinError
              ? error
              : new HitchfinError(
                  `image attachment could not be read: ${errorMessage(error)}`,
                  'INVALID_REQUEST',
                  { cause: error },
                ),
            options.signal,
          ),
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
          messages,
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
        // A request the provider considers malformed will be rejected the same
        // way by every account; do not spend the failover budget on it.
        if (failure.code === 'INVALID_REQUEST' || failure.code === 'UNSUPPORTED_CONTENT') {
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

  /**
   * Turn durable host images into the base64 blocks both transports serialize.
   * Without an attachment reader the catalog stops advertising image input;
   * this fallback only protects a request that already carries one.
   */
  private async projectImages(
    messages: readonly RequestMessage[],
    signal?: AbortSignal,
  ): Promise<readonly RequestMessage[]> {
    let changedAny = false
    const projected: RequestMessage[] = []
    for (const message of messages) {
      if (!Array.isArray(message.content)) {
        projected.push(message)
        continue
      }
      let changed = false
      const content: RequestContentBlock[] = []
      for (const block of message.content) {
        if (block && typeof block === 'object' && block.type === 'image') {
          const record = block as Record<string, unknown>
          const reference = record.attachment
          if (reference && typeof reference === 'object') {
            if (this.options.readImage && record.offloaded !== true) {
              const version = await this.options.readImage(
                reference as ImageAttachmentRef,
                signal,
              )
              content.push({
                type: 'image',
                image: Buffer.from(version.data).toString('base64'),
                mimeType: version.mediaType,
              })
              changed = true
              continue
            }
            content.push({ type: 'text', text: '[image attachment omitted]' })
            changed = true
            continue
          }
        }
        content.push(block)
      }
      if (changed) {
        projected.push({ ...message, content })
        changedAny = true
      } else {
        projected.push(message)
      }
    }
    return changedAny ? projected : messages
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
