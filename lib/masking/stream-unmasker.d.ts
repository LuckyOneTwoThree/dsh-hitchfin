import type { ContentBlock, StreamChunk } from '@deepseek-ai/dsh-llm';
import { SecretVault } from './placeholder.js';
import { PolicyGuard } from './policy-guard.js';
export declare class StreamingUnmasker {
    private readonly vault;
    private readonly policyGuard;
    private blocks;
    constructor(vault: SecretVault, policyGuard: PolicyGuard);
    /**
     * Unmask all complete `{{HF_SEC_xxxxxxxx}}` placeholders in `text`.
     */
    unmaskCompleteString(text: string, mode: 'plain' | 'json-string', toolName?: string): string;
    /**
     * Unmask a complete assembled ContentBlock (used on `block-end`).
     */
    unmaskBlock(block: ContentBlock): ContentBlock;
    /**
     * Transform an upstream StreamChunk stream into an unmasked StreamChunk stream,
     * handling cross-chunk split placeholders and `block-end.block` synchronization.
     */
    transformStream(source: AsyncIterable<StreamChunk>): AsyncGenerator<StreamChunk, void, unknown>;
}
