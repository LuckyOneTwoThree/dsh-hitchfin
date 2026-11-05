import { type GenerateOptions, LlmAdapter, type LlmModelInfo, type LlmProviderInfo, type LlmResolvedModelInfo, type RequestMessage, type StreamChunk } from '@deepseek-ai/dsh-llm';
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
export declare class HitchfinAdapter extends LlmAdapter {
    private readonly router;
    private readonly transport;
    private catalog;
    constructor(entries: HitchfinCatalogEntry[], router: GroupRouter, transport: UpstreamStreamTransport);
    replaceCatalog(entries: HitchfinCatalogEntry[]): string[];
    providerIds(): string[];
    providerInfo(provider: string): LlmProviderInfo;
    listModels(provider: string): Promise<readonly LlmModelInfo[]>;
    resolveModel(provider: string, model: string, _signal?: AbortSignal): Promise<LlmResolvedModelInfo>;
    stream(options: GenerateOptions): AsyncGenerator<StreamChunk, void, unknown>;
}
