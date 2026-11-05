import { escapeForJsonString, PLACEHOLDER_EXACT_LEN, PLACEHOLDER_REGEX, } from './placeholder.js';
/**
 * Find the earliest index in `text` near the tail that could be the start of an incomplete
 * `{{HF_SEC_xxxxxxxx}}` placeholder. Returns -1 if no partial prefix exists at the tail.
 */
function findTrailingPartialPlaceholderStart(text) {
    const maxTail = Math.min(text.length, PLACEHOLDER_EXACT_LEN - 1);
    const startSearch = text.length - maxTail;
    for (let i = startSearch; i < text.length; i++) {
        if (text[i] !== '{')
            continue;
        const tail = text.slice(i);
        if (isValidPlaceholderPrefix(tail)) {
            return i;
        }
    }
    return -1;
}
const PREFIX_TEMPLATE = '{{HF_SEC_';
function isValidPlaceholderPrefix(tail) {
    if (tail.length >= PLACEHOLDER_EXACT_LEN)
        return false;
    for (let i = 0; i < tail.length; i++) {
        const ch = tail[i];
        if (i < PREFIX_TEMPLATE.length) {
            if (ch !== PREFIX_TEMPLATE[i])
                return false;
        }
        else if (i < PREFIX_TEMPLATE.length + 8) {
            if (!/[0-9a-f]/.test(ch))
                return false;
        }
        else {
            if (ch !== '}')
                return false;
        }
    }
    return true;
}
export class StreamingUnmasker {
    vault;
    policyGuard;
    blocks = new Map();
    constructor(vault, policyGuard) {
        this.vault = vault;
        this.policyGuard = policyGuard;
    }
    /**
     * Unmask all complete `{{HF_SEC_xxxxxxxx}}` placeholders in `text`.
     */
    unmaskCompleteString(text, mode, toolName) {
        if (!text.includes('{{HF_SEC_'))
            return text;
        if (toolName !== undefined &&
            !this.policyGuard.canUnmaskForTool(toolName, text)) {
            return text;
        }
        return text.replace(PLACEHOLDER_REGEX, (match) => {
            const raw = this.vault.resolvePlaceholder(match);
            if (raw === undefined)
                return match;
            return mode === 'json-string' ? escapeForJsonString(raw) : raw;
        });
    }
    /**
     * Unmask a complete assembled ContentBlock (used on `block-end`).
     */
    unmaskBlock(block) {
        if (block.type === 'text') {
            return {
                ...block,
                text: this.unmaskCompleteString(block.text, 'plain'),
            };
        }
        if (block.type === 'reasoning') {
            return {
                ...block,
                text: this.unmaskCompleteString(block.text, 'plain'),
            };
        }
        if (block.type === 'tool-call') {
            return {
                ...block,
                arguments: this.unmaskCompleteString(block.arguments, 'json-string', block.name),
            };
        }
        return block;
    }
    /**
     * Transform an upstream StreamChunk stream into an unmasked StreamChunk stream,
     * handling cross-chunk split placeholders and `block-end.block` synchronization.
     */
    async *transformStream(source) {
        for await (const chunk of source) {
            if (chunk.type === 'block-start') {
                this.blocks.set(chunk.index, {
                    blockType: chunk.blockType,
                    buffer: '',
                });
                yield chunk;
                continue;
            }
            if (chunk.type === 'text-delta' ||
                chunk.type === 'reasoning-delta' ||
                chunk.type === 'tool-call-delta') {
                let state = this.blocks.get(chunk.index);
                if (!state) {
                    state = {
                        blockType: chunk.type === 'text-delta'
                            ? 'text'
                            : chunk.type === 'reasoning-delta'
                                ? 'reasoning'
                                : 'tool-call',
                        buffer: '',
                    };
                    this.blocks.set(chunk.index, state);
                }
                if (chunk.type === 'tool-call-delta') {
                    state.toolId = chunk.id;
                    if (chunk.name !== undefined) {
                        state.toolName = chunk.name;
                    }
                }
                const incoming = chunk.type === 'tool-call-delta' ? chunk.argumentsDelta : chunk.text;
                const combined = state.buffer + incoming;
                const splitIdx = findTrailingPartialPlaceholderStart(combined);
                let readyPart;
                if (splitIdx === -1) {
                    readyPart = combined;
                    state.buffer = '';
                }
                else {
                    readyPart = combined.slice(0, splitIdx);
                    state.buffer = combined.slice(splitIdx);
                }
                if (readyPart.length > 0 || (chunk.type === 'tool-call-delta' && chunk.name !== undefined)) {
                    const mode = chunk.type === 'tool-call-delta' ? 'json-string' : 'plain';
                    const unmasked = this.unmaskCompleteString(readyPart, mode, state.toolName);
                    if (chunk.type === 'tool-call-delta') {
                        yield {
                            ...chunk,
                            argumentsDelta: unmasked,
                        };
                    }
                    else {
                        yield {
                            ...chunk,
                            text: unmasked,
                        };
                    }
                }
                continue;
            }
            if (chunk.type === 'block-end') {
                const state = this.blocks.get(chunk.index);
                const toolName = state?.toolName ??
                    (chunk.block.type === 'tool-call' ? chunk.block.name : undefined);
                if (state && state.buffer.length > 0) {
                    const mode = state.blockType === 'tool-call' ? 'json-string' : 'plain';
                    const flushed = this.unmaskCompleteString(state.buffer, mode, toolName);
                    state.buffer = '';
                    if (state.blockType === 'text') {
                        yield {
                            type: 'text-delta',
                            index: chunk.index,
                            text: flushed,
                        };
                    }
                    else if (state.blockType === 'reasoning') {
                        yield {
                            type: 'reasoning-delta',
                            index: chunk.index,
                            text: flushed,
                        };
                    }
                    else if (state.blockType === 'tool-call' && state.toolId !== undefined) {
                        yield {
                            type: 'tool-call-delta',
                            index: chunk.index,
                            id: state.toolId,
                            argumentsDelta: flushed,
                        };
                    }
                }
                this.blocks.delete(chunk.index);
                yield {
                    ...chunk,
                    block: this.unmaskBlock(chunk.block),
                };
                continue;
            }
            yield chunk;
        }
    }
}
