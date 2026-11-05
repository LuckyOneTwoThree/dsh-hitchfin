import type {
  ContentBlock,
  GenerateOptions,
  RequestMessage,
  StreamChunk,
} from '@deepseek-ai/dsh-llm';
import { SecretVault } from './placeholder.js';
import { PolicyGuard } from './policy-guard.js';
import { StreamingUnmasker } from './stream-unmasker.js';

/**
 * Create a detached, masked copy of a GenerateOptions request without mutating
 * any deep-frozen input messages or blocks.
 */
export function maskGenerateOptions(
  options: GenerateOptions,
  vault: SecretVault,
): GenerateOptions {
  const maskBlock = (block: ContentBlock): ContentBlock => {
    if (block.type === 'text') {
      const masked = vault.maskText(block.text);
      return masked === block.text ? block : { ...block, text: masked };
    }
    if (block.type === 'reasoning') {
      const masked = vault.maskText(block.text);
      return masked === block.text ? block : { ...block, text: masked };
    }
    if (block.type === 'tool-call') {
      const masked = vault.maskText(block.arguments);
      return masked === block.arguments
        ? block
        : { ...block, arguments: masked };
    }
    return block;
  };

  const maskMessage = (msg: RequestMessage): RequestMessage => {
    const maskedContent = msg.content.map(maskBlock);
    return {
      ...msg,
      content: maskedContent,
    };
  };

  const maskedMessages = options.messages.map(maskMessage);
  const maskedSystem =
    typeof options.system === 'string'
      ? vault.maskText(options.system)
      : options.system;

  return {
    ...options,
    messages: maskedMessages,
    ...(maskedSystem !== undefined ? { system: maskedSystem } : {}),
  };
}

/**
 * Create a Cordis `llm/stream` waterfall listener that masks outbound prompts
 * and unmasks inbound streams subject to PolicyGuard constraints.
 */
export function createMaskingWaterfallListener(
  vault: SecretVault,
  policyGuard: PolicyGuard,
  isEnabled: () => boolean = () => true,
) {
  return (
    options: GenerateOptions,
    next: (opts?: GenerateOptions) => AsyncIterable<StreamChunk>,
  ): AsyncIterable<StreamChunk> => {
    if (!isEnabled()) {
      return next(options);
    }
    const maskedOptions = maskGenerateOptions(options, vault);
    const upstream = next(maskedOptions);
    const unmasker = new StreamingUnmasker(vault, policyGuard);
    return unmasker.transformStream(upstream);
  };
}
