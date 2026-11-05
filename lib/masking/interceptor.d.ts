import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm';
import { SecretVault } from './placeholder.js';
import { PolicyGuard } from './policy-guard.js';
/**
 * Create a detached, masked copy of a GenerateOptions request without mutating
 * any deep-frozen input messages or blocks.
 */
export declare function maskGenerateOptions(options: GenerateOptions, vault: SecretVault): GenerateOptions;
/**
 * Create a Cordis `llm/stream` waterfall listener that masks outbound prompts
 * and unmasks inbound streams subject to PolicyGuard constraints.
 */
export declare function createMaskingWaterfallListener(vault: SecretVault, policyGuard: PolicyGuard, isEnabled?: () => boolean): (options: GenerateOptions, next: (opts?: GenerateOptions) => AsyncIterable<StreamChunk>) => AsyncIterable<StreamChunk>;
