import {
  type GenerateOptions,
  LlmAdapter,
  LlmError,
  type LlmFailure,
  type LlmModelInfo,
  type LlmProviderInfo,
  type LlmResolvedModelInfo,
  type RequestMessage,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm';
import type { GroupRouter } from '../router/group-router.js';
import type { RoutingStrategy } from '../rpc/types.js';

export interface HitchfinCatalogEntry {
  provider: LlmProviderInfo;
  models: Array<{
    info: LlmModelInfo;
    resolved?: Partial<LlmResolvedModelInfo>;
  }>;
  strategy?: RoutingStrategy;
}

export type UpstreamStreamTransport = (params: {
  channelId: string;
  slotId: string;
  modelId: string;
  messages: readonly RequestMessage[];
  options: GenerateOptions;
  signal?: AbortSignal;
}) => AsyncIterable<StreamChunk>;

export class HitchfinAdapter extends LlmAdapter {
  private catalog = new Map<string, HitchfinCatalogEntry>();

  constructor(
    entries: HitchfinCatalogEntry[],
    private readonly router: GroupRouter,
    private readonly transport: UpstreamStreamTransport,
  ) {
    super();
    this.replaceCatalog(entries);
  }

  replaceCatalog(entries: HitchfinCatalogEntry[]): string[] {
    this.catalog.clear();
    for (const entry of entries) {
      this.catalog.set(entry.provider.id, entry);
    }
    return this.providerIds();
  }

  providerIds(): string[] {
    return [...this.catalog.keys()];
  }

  override providerInfo(provider: string): LlmProviderInfo {
    const entry = this.catalog.get(provider);
    if (!entry) {
      return { id: provider, name: provider };
    }
    return {
      id: entry.provider.id,
      name: entry.provider.name,
    };
  }

  override async listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    const entry = this.catalog.get(provider);
    if (!entry) return [];
    return entry.models.map((m) => ({
      provider: m.info.provider,
      id: m.info.id,
      name: m.info.name,
      ...(m.info.description !== undefined
        ? { description: m.info.description }
        : {}),
      ...(m.info.inputModalities !== undefined
        ? { inputModalities: [...m.info.inputModalities] }
        : {}),
    }));
  }

  override async resolveModel(
    provider: string,
    model: string,
    _signal?: AbortSignal,
  ): Promise<LlmResolvedModelInfo> {
    const entry = this.catalog.get(provider);
    const found = entry?.models.find((m) => m.info.id === model);
    if (found) {
      return {
        provider: found.info.provider,
        id: found.info.id,
        name: found.info.name,
        ...(found.info.description !== undefined
          ? { description: found.info.description }
          : {}),
        ...(found.info.inputModalities !== undefined
          ? { inputModalities: [...found.info.inputModalities] }
          : {}),
        context: found.resolved?.context ?? { contextWindow: 128_000 },
        defaultMaxTokens: found.resolved?.defaultMaxTokens ?? 16_384,
        ...(found.resolved?.reasoning !== undefined
          ? { reasoning: found.resolved.reasoning }
          : {}),
      };
    }
    return {
      provider,
      id: model,
      name: model,
      context: { contextWindow: 128_000 },
      defaultMaxTokens: 16_384,
    };
  }

  override async *stream(
    options: GenerateOptions,
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const signal = options.signal;
    if (signal?.aborted) {
      const failure: LlmFailure = {
        code: 'ABORTED',
        message: 'Request aborted before start',
      };
      yield {
        type: 'finish',
        reason: { kind: 'aborted', failure },
      };
      return;
    }

    const entry = this.catalog.get(options.provider);
    if (!entry) {
      throw new LlmError(
        `dsh-hitchfin: unknown provider "${options.provider}"`,
        'INVALID_REQUEST',
      );
    }

    const selection = this.router.selectAccount(
      options.provider,
      options.model,
      entry.strategy ?? 'smart',
      {
        sessionId: options.sessionId,
        providerId: options.provider,
        modelId: options.model,
        reasoningEffort: options.reasoningEffort,
      },
    );

    let emittedAnyChunk = false;
    try {
      const upstream = this.transport({
        channelId: selection.channelId,
        slotId: selection.slotId,
        modelId: selection.modelId,
        messages: options.messages,
        options,
        signal,
      });

      for await (const chunk of upstream) {
        if (signal?.aborted) {
          const failure: LlmFailure = {
            code: 'ABORTED',
            message: 'Request aborted during stream',
          };
          yield {
            type: 'finish',
            reason: { kind: 'aborted', failure },
          };
          return;
        }
        emittedAnyChunk = true;
        yield chunk;
      }
    } catch (err) {
      if (signal?.aborted) {
        const failure: LlmFailure = {
          code: 'ABORTED',
          message: err instanceof Error ? err.message : 'Request aborted',
        };
        yield {
          type: 'finish',
          reason: { kind: 'aborted', failure },
        };
        return;
      }

      if (!emittedAnyChunk) {
        if (err instanceof LlmError && err.code === 'RATE_LIMIT') {
          this.router.recordFailureAndThrowForStepRetry(
            selection,
            err.failure.status ?? 429,
            err.message,
          );
        }
        const status = (err as { status?: number })?.status;
        if (status === 429 || (status !== undefined && status >= 500)) {
          this.router.recordFailureAndThrowForStepRetry(
            selection,
            status,
            err instanceof Error ? err.message : String(err),
          );
        }
      }
      throw err;
    }
  }
}
