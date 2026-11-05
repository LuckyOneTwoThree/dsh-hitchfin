import { attributionHeaders, LlmError, ToolCallId, } from '@deepseek-ai/dsh-llm';
function flattenContentToText(content) {
    const parts = [];
    for (const block of content) {
        if (block.type === 'text') {
            parts.push(block.text);
        }
    }
    return parts.join('\n');
}
export function buildOpenAiMessages(messages, system) {
    const out = [];
    if (typeof system === 'string' && system.length > 0) {
        out.push({
            role: 'system',
            content: system,
        });
    }
    for (const msg of messages) {
        switch (msg.role) {
            case 'system':
            case 'developer': {
                const text = flattenContentToText(msg.content);
                if (text.length > 0) {
                    out.push({
                        role: msg.role === 'developer' ? 'developer' : 'system',
                        content: text,
                    });
                }
                break;
            }
            case 'user': {
                out.push({
                    role: 'user',
                    content: flattenContentToText(msg.content),
                });
                break;
            }
            case 'assistant': {
                const textParts = [];
                const reasoningParts = [];
                const toolCalls = [];
                for (const block of msg.content) {
                    if (block.type === 'text') {
                        textParts.push(block.text);
                    }
                    else if (block.type === 'reasoning') {
                        reasoningParts.push(block.text);
                    }
                    else if (block.type === 'tool-call') {
                        toolCalls.push({
                            id: String(block.id),
                            type: 'function',
                            function: {
                                name: block.name,
                                arguments: block.arguments,
                            },
                        });
                    }
                }
                const assistantEntry = {
                    role: 'assistant',
                    content: textParts.length > 0 ? textParts.join('') : null,
                };
                if (reasoningParts.length > 0) {
                    assistantEntry.reasoning_content = reasoningParts.join('');
                }
                if (toolCalls.length > 0) {
                    assistantEntry.tool_calls = toolCalls;
                }
                out.push(assistantEntry);
                break;
            }
            case 'tool': {
                const toolCallId = 'source' in msg &&
                    msg.source &&
                    typeof msg.source === 'object' &&
                    'toolCallId' in msg.source
                    ? String(msg.source.toolCallId)
                    : '';
                out.push({
                    role: 'tool',
                    tool_call_id: toolCallId,
                    content: flattenContentToText(msg.content),
                });
                break;
            }
        }
    }
    return out;
}
function parseRetryAfterMs(headerValue) {
    if (!headerValue)
        return undefined;
    const trimmed = headerValue.trim();
    const seconds = Number(trimmed);
    if (Number.isFinite(seconds) && seconds > 0) {
        return Math.ceil(seconds * 1000);
    }
    const dateMs = Date.parse(trimmed);
    if (Number.isFinite(dateMs)) {
        const delta = dateMs - Date.now();
        if (delta > 0)
            return delta;
    }
    return undefined;
}
function normalizeChatCompletionsUrl(baseUrl) {
    const trimmed = baseUrl.replace(/\/+$/, '');
    if (trimmed.endsWith('/chat/completions')) {
        return trimmed;
    }
    if (trimmed.endsWith('/v1')) {
        return `${trimmed}/chat/completions`;
    }
    return `${trimmed}/v1/chat/completions`;
}
export function createOpenAiSseTransport(config) {
    const fetchImpl = config.customFetch ?? fetch;
    return async function* openAiSseTransport(params) {
        const { channelId, slotId, modelId, messages, options, signal } = params;
        const baseUrl = await config.resolveBaseUrl({ channelId, slotId, modelId });
        const url = normalizeChatCompletionsUrl(baseUrl);
        const token = await config.resolveAuthToken?.({
            channelId,
            slotId,
            modelId,
        });
        const extraHeaders = await config.resolveExtraHeaders?.({
            channelId,
            slotId,
            modelId,
        });
        // Attribution headers (`user-agent`) are mandatory on every DSH adapter request
        const headers = {
            'content-type': 'application/json',
            accept: 'text/event-stream',
            ...(extraHeaders ?? {}),
            ...attributionHeaders(),
        };
        if (token && token.trim().length > 0) {
            headers.authorization = `Bearer ${token.trim()}`;
        }
        const requestBody = {
            model: modelId,
            messages: buildOpenAiMessages(messages, options.system),
            stream: true,
            stream_options: { include_usage: true },
        };
        if (options.tools && options.tools.length > 0) {
            requestBody.tools = options.tools.map((t) => ({
                type: 'function',
                function: {
                    name: t.name,
                    description: t.description,
                    parameters: t.parameters,
                },
            }));
        }
        if (options.reasoningEffort !== undefined) {
            requestBody.reasoning_effort = String(options.reasoningEffort);
        }
        if (options.temperature !== undefined) {
            requestBody.temperature = options.temperature;
        }
        if (options.maxTokens !== undefined) {
            requestBody.max_tokens = options.maxTokens;
        }
        if (options.stop !== undefined && options.stop.length > 0) {
            requestBody.stop = options.stop;
        }
        const response = await fetchImpl(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody),
            ...(signal ? { signal } : {}),
        });
        if (!response.ok) {
            let detail = '';
            try {
                const text = await response.text();
                if (text)
                    detail = `: ${text.slice(0, 300)}`;
            }
            catch {
                // ignore body read error
            }
            const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
            if (response.status === 429) {
                throw new LlmError(`dsh-hitchfin: rate limit (429) on ${channelId}/${slotId}${detail}`, 'RATE_LIMIT', {
                    status: 429,
                    ...(retryAfterMs !== undefined
                        ? { providerRetryAfterMs: retryAfterMs }
                        : {}),
                });
            }
            if (response.status === 401 || response.status === 403) {
                throw new LlmError(`dsh-hitchfin: authentication failed (${response.status}) on ${channelId}/${slotId}${detail}`, 'AUTH', { status: response.status });
            }
            if (response.status >= 500) {
                throw new LlmError(`dsh-hitchfin: upstream server error (${response.status}) on ${channelId}/${slotId}${detail}`, 'SERVER', {
                    status: response.status,
                    ...(retryAfterMs !== undefined
                        ? { providerRetryAfterMs: retryAfterMs }
                        : {}),
                });
            }
            throw new LlmError(`dsh-hitchfin: request rejected (${response.status}) on ${channelId}/${slotId}${detail}`, 'INVALID_REQUEST', { status: response.status });
        }
        if (!response.body) {
            throw new LlmError(`dsh-hitchfin: empty response body from ${url}`, 'TRANSPORT');
        }
        let nextBlockIndex = 0;
        let activeStreamBlock = null;
        const toolCallMap = new Map();
        let latestUsage = null;
        let finishReasonKind = 'stop';
        const closeActiveStreamBlock = function* () {
            if (!activeStreamBlock)
                return;
            if (activeStreamBlock.kind === 'reasoning') {
                yield {
                    type: 'block-end',
                    index: activeStreamBlock.index,
                    block: {
                        type: 'reasoning',
                        text: activeStreamBlock.text,
                    },
                };
            }
            else {
                yield {
                    type: 'block-end',
                    index: activeStreamBlock.index,
                    block: {
                        type: 'text',
                        text: activeStreamBlock.text,
                    },
                };
            }
            activeStreamBlock = null;
        };
        const processSseDataLine = function* (dataPayload) {
            const trimmed = dataPayload.trim();
            if (!trimmed)
                return false;
            if (trimmed === '[DONE]') {
                return true;
            }
            let parsed;
            try {
                parsed = JSON.parse(trimmed);
            }
            catch {
                return false;
            }
            if (parsed.usage) {
                const promptTokens = parsed.usage.prompt_tokens ?? 0;
                const completionTokens = parsed.usage.completion_tokens ?? 0;
                const cachedTokens = parsed.usage.prompt_tokens_details?.cached_tokens ?? 0;
                const reasoningTokens = parsed.usage.completion_tokens_details?.reasoning_tokens ?? 0;
                const uncachedInput = Math.max(0, promptTokens - cachedTokens);
                latestUsage = {
                    inputTokens: uncachedInput,
                    outputTokens: completionTokens,
                    ...(parsed.usage.total_tokens !== undefined
                        ? { totalTokens: parsed.usage.total_tokens }
                        : { totalTokens: promptTokens + completionTokens }),
                    ...(cachedTokens > 0 ? { cacheReadTokens: cachedTokens } : {}),
                    ...(reasoningTokens > 0 ? { reasoningTokens } : {}),
                };
            }
            const choice = parsed.choices?.[0];
            if (!choice)
                return false;
            const delta = choice.delta;
            if (delta) {
                const reasoningDelta = typeof delta.reasoning_content === 'string'
                    ? delta.reasoning_content
                    : typeof delta.reasoning === 'string'
                        ? delta.reasoning
                        : '';
                if (reasoningDelta.length > 0) {
                    if (activeStreamBlock && activeStreamBlock.kind !== 'reasoning') {
                        yield* closeActiveStreamBlock();
                    }
                    if (!activeStreamBlock) {
                        const idx = nextBlockIndex++;
                        activeStreamBlock = { kind: 'reasoning', index: idx, text: '' };
                        yield {
                            type: 'block-start',
                            index: idx,
                            blockType: 'reasoning',
                        };
                    }
                    activeStreamBlock.text += reasoningDelta;
                    yield {
                        type: 'reasoning-delta',
                        index: activeStreamBlock.index,
                        text: reasoningDelta,
                    };
                }
                if (typeof delta.content === 'string' && delta.content.length > 0) {
                    if (activeStreamBlock && activeStreamBlock.kind !== 'text') {
                        yield* closeActiveStreamBlock();
                    }
                    if (!activeStreamBlock) {
                        const idx = nextBlockIndex++;
                        activeStreamBlock = { kind: 'text', index: idx, text: '' };
                        yield {
                            type: 'block-start',
                            index: idx,
                            blockType: 'text',
                        };
                    }
                    activeStreamBlock.text += delta.content;
                    yield {
                        type: 'text-delta',
                        index: activeStreamBlock.index,
                        text: delta.content,
                    };
                }
                if (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0) {
                    yield* closeActiveStreamBlock();
                    for (const tc of delta.tool_calls) {
                        const tcIndex = tc.index ?? 0;
                        let state = toolCallMap.get(tcIndex);
                        if (!state) {
                            const blockIndex = nextBlockIndex++;
                            const initialId = ToolCallId(tc.id && tc.id.length > 0
                                ? tc.id
                                : `call_${blockIndex}_${tcIndex}`);
                            const initialName = tc.function?.name ?? '';
                            state = {
                                blockIndex,
                                id: initialId,
                                name: initialName,
                                args: '',
                            };
                            toolCallMap.set(tcIndex, state);
                            yield {
                                type: 'block-start',
                                index: blockIndex,
                                blockType: 'tool-call',
                            };
                        }
                        else {
                            if (tc.id && tc.id.length > 0) {
                                state.id = ToolCallId(tc.id);
                            }
                            if (tc.function?.name && tc.function.name.length > 0) {
                                state.name = tc.function.name;
                            }
                        }
                        const argsDelta = tc.function?.arguments ?? '';
                        state.args += argsDelta;
                        yield {
                            type: 'tool-call-delta',
                            index: state.blockIndex,
                            id: state.id,
                            ...(state.name.length > 0 ? { name: state.name } : {}),
                            argumentsDelta: argsDelta,
                        };
                    }
                }
            }
            if (choice.finish_reason) {
                if (choice.finish_reason === 'tool_calls' ||
                    choice.finish_reason === 'function_call') {
                    finishReasonKind = 'tool-calls';
                }
                else if (choice.finish_reason === 'length') {
                    finishReasonKind = 'max-tokens';
                }
                else {
                    finishReasonKind = 'stop';
                }
            }
            return false;
        };
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                let newlineIdx = buffer.indexOf('\n');
                while (newlineIdx !== -1) {
                    const rawLine = buffer.slice(0, newlineIdx).replace(/\r$/, '');
                    buffer = buffer.slice(newlineIdx + 1);
                    if (rawLine.startsWith('data:')) {
                        const isDone = yield* processSseDataLine(rawLine.slice(5));
                        if (isDone) {
                            buffer = '';
                            break;
                        }
                    }
                    newlineIdx = buffer.indexOf('\n');
                }
            }
            if (buffer.trim().length > 0) {
                const remainingLines = buffer.split(/\r?\n/);
                for (const line of remainingLines) {
                    if (line.startsWith('data:')) {
                        const isDone = yield* processSseDataLine(line.slice(5));
                        if (isDone)
                            break;
                    }
                }
            }
        }
        finally {
            await reader.cancel().catch(() => { });
        }
        yield* closeActiveStreamBlock();
        for (const tcState of toolCallMap.values()) {
            yield {
                type: 'block-end',
                index: tcState.blockIndex,
                block: {
                    type: 'tool-call',
                    id: tcState.id,
                    name: tcState.name || 'unknown_tool',
                    arguments: tcState.args.length > 0 ? tcState.args : '{}',
                },
            };
        }
        if (toolCallMap.size > 0 && finishReasonKind === 'stop') {
            finishReasonKind = 'tool-calls';
        }
        yield {
            type: 'usage',
            usage: latestUsage ?? {
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
            },
        };
        const reason = { kind: finishReasonKind };
        yield {
            type: 'finish',
            reason,
        };
    };
}
