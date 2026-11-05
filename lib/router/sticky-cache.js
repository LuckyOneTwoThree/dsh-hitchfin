export function formatStickyCompositeKey(params) {
    const sessionPart = params.sessionId ?? 'ephemeral';
    const effortPart = params.reasoningEffort ?? 'default';
    return `${sessionPart}::${params.providerId}::${params.modelId}::${effortPart}`;
}
export class StickySessionCache {
    cooldown;
    ttlMs;
    bindings = new Map();
    constructor(cooldown, ttlMs = 30 * 60 * 1000) {
        this.cooldown = cooldown;
        this.ttlMs = ttlMs;
    }
    get(params, now = Date.now()) {
        if (!params.sessionId)
            return undefined;
        const key = formatStickyCompositeKey(params);
        const binding = this.bindings.get(key);
        if (!binding)
            return undefined;
        if (now - binding.boundAt > this.ttlMs) {
            this.bindings.delete(key);
            return undefined;
        }
        if (!this.cooldown.isSelectable(binding.channelId, binding.slotId, now)) {
            this.bindings.delete(key);
            return undefined;
        }
        return binding;
    }
    bind(params, binding, now = Date.now()) {
        if (!params.sessionId)
            return;
        const key = formatStickyCompositeKey(params);
        this.bindings.set(key, {
            ...binding,
            boundAt: now,
        });
    }
    invalidate(params) {
        const key = formatStickyCompositeKey(params);
        this.bindings.delete(key);
    }
    invalidateAccount(channelId, slotId) {
        for (const [key, value] of this.bindings.entries()) {
            if (value.channelId === channelId && value.slotId === slotId) {
                this.bindings.delete(key);
            }
        }
    }
}
