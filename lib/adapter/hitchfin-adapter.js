import { LlmAdapter, LlmError, } from '@deepseek-ai/dsh-llm';
export class HitchfinAdapter extends LlmAdapter {
    router;
    transport;
    catalog = new Map();
    constructor(entries, router, transport) {
        super();
        this.router = router;
        this.transport = transport;
        this.replaceCatalog(entries);
    }
    replaceCatalog(entries) {
        this.catalog.clear();
        for (const entry of entries) {
            this.catalog.set(entry.provider.id, entry);
        }
        return this.providerIds();
    }
    providerIds() {
        return [...this.catalog.keys()];
    }
    providerInfo(provider) {
        const entry = this.catalog.get(provider);
        if (!entry) {
            return { id: provider, name: provider };
        }
        return {
            id: entry.provider.id,
            name: entry.provider.name,
        };
    }
    async listModels(provider) {
        const entry = this.catalog.get(provider);
        if (!entry)
            return [];
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
    async resolveModel(provider, model, _signal) {
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
    async *stream(options) {
        const signal = options.signal;
        if (signal?.aborted) {
            const failure = {
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
            throw new LlmError(`dsh-hitchfin: unknown provider "${options.provider}"`, 'INVALID_REQUEST');
        }
        const selection = this.router.selectAccount(options.provider, options.model, entry.strategy ?? 'smart', {
            sessionId: options.sessionId,
            providerId: options.provider,
            modelId: options.model,
            reasoningEffort: options.reasoningEffort,
        });
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
                    const failure = {
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
        }
        catch (err) {
            if (signal?.aborted) {
                const failure = {
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
                    this.router.recordFailureAndThrowForStepRetry(selection, err.failure.status ?? 429, err.message);
                }
                const status = err?.status;
                if (status === 429 || (status !== undefined && status >= 500)) {
                    this.router.recordFailureAndThrowForStepRetry(selection, status, err instanceof Error ? err.message : String(err));
                }
            }
            throw err;
        }
    }
}
