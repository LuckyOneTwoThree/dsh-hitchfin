import { createOpenAiSseTransport } from './openai-sse.js'
import { HitchfinError, errorMessage } from '../errors.js'
import { dedupeModels } from '../models.js'
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

  constructor(private readonly options: HitchfinAdapterOptions) {}

  invalidate(provider?: string): void {
    if (provider) {
      this.cache.delete(provider)
    } else {
      this.cache.clear()
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
      const accounts = await this.options.accounts.list(descriptor.id)
      const sources: readonly Pick<
        AccountPayload,
        'accountId' | 'auth' | 'freeOnly' | 'hiddenModels'
      >[] =
        accounts.length > 0
          ? accounts
          : this.options.devStaticModels
            ? [{ accountId: 'static', auth: undefined, freeOnly: false, hiddenModels: [] }]
            : []

      const byId = new Map<string, ModelRecord>()
      for (const account of sources) {
        const models = await this.options.worker.models({
          channel: loadInfo,
          accountId: account.accountId,
          auth: account.auth,
          freeOnly: account.freeOnly !== false,
        })
        const hidden = new Set(account.hiddenModels ?? [])
        const hasFreeMetadata = models.some((model) => model.freeKnown)
        const usable =
          account.freeOnly !== false && hasFreeMetadata
            ? models.filter((model) => model.freeKnown && model.free)
            : models
        if (
          account.freeOnly !== false &&
          hasFreeMetadata &&
          usable.length === 0 &&
          models.length > 0
        ) {
          this.options.logger.warn(
            `dsh-hitchfin: ${descriptor.displayName} has no free model available; hiding ${models.length} model(s) under free-only`,
          )
        }
        for (const model of usable) {
          if (hidden.has(model.id)) continue
          const existing = byId.get(model.id)
          if (!existing || (model.freeKnown && model.free && !existing.free)) {
            byId.set(model.id, { ...model, accountId: account.accountId })
          }
        }
      }

      const models = dedupeModels([...byId.values()]).map((record) =>
        modelInfo(descriptor, record),
      )
      this.cache.set(provider, { at: Date.now(), models })
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

    let account: AccountPayload | undefined
    try {
      const accounts = await this.options.accounts.list(descriptor.id)
      account = accounts.find((entry) => entry.auth !== undefined) ?? accounts[0]
    } catch (error) {
      this.options.logger.warn(
        `dsh-hitchfin: reading accounts for ${descriptor.displayName} failed: ${errorMessage(error)}`,
      )
    }

    if (!account) {
      yield {
        type: 'finish',
        reason: {
          kind: 'error',
          failure: {
            message: `Sign in to ${descriptor.displayName} before using this model`,
            code: 'AUTH',
          },
        },
      }
      return
    }

    // Each request owns its worker call; a shared "current request" field would
    // cross two concurrent chats.
    const transport = createOpenAiSseTransport((input, init) =>
      this.options.worker.fetch(input, init, {
        channel: loadInfo,
        accountId: account.accountId,
        auth: account.auth,
        freeOnly: account.freeOnly !== false,
        model: options.model,
        sessionId: options.sessionId,
      } satisfies ChannelCallOptions & { sessionId?: string }),
    )

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
        yield chunk
      }
    } catch (error) {
      yield {
        type: 'finish',
        reason: {
          kind: options.signal?.aborted ? 'aborted' : 'error',
          failure: failureOf(error, options.signal),
        },
      }
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
