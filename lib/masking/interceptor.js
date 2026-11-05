import { StreamingUnmasker } from './stream-unmasker.js';
/**
 * Create a detached, masked copy of a GenerateOptions request without mutating
 * any deep-frozen input messages or blocks.
 */
export function maskGenerateOptions(options, vault) {
    const maskBlock = (block) => {
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
    const maskMessage = (msg) => {
        const maskedContent = msg.content.map(maskBlock);
        return {
            ...msg,
            content: maskedContent,
        };
    };
    const maskedMessages = options.messages.map(maskMessage);
    const maskedSystem = typeof options.system === 'string'
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
export function createMaskingWaterfallListener(vault, policyGuard, isEnabled = () => true) {
    return (options, next) => {
        if (!isEnabled()) {
            return next(options);
        }
        const maskedOptions = maskGenerateOptions(options, vault);
        const upstream = next(maskedOptions);
        const unmasker = new StreamingUnmasker(vault, policyGuard);
        return unmasker.transformStream(upstream);
    };
}
