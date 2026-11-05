import type { CooldownTracker } from './cooldown.js';
export interface StickyBinding {
    channelId: string;
    slotId: string;
    modelId: string;
    boundAt: number;
}
export interface StickyCompositeKeyParams {
    sessionId?: string;
    providerId: string;
    modelId: string;
    reasoningEffort?: string;
}
export declare function formatStickyCompositeKey(params: StickyCompositeKeyParams): string;
export declare class StickySessionCache {
    private readonly cooldown;
    private readonly ttlMs;
    private bindings;
    constructor(cooldown: CooldownTracker, ttlMs?: number);
    get(params: StickyCompositeKeyParams, now?: number): StickyBinding | undefined;
    bind(params: StickyCompositeKeyParams, binding: Omit<StickyBinding, 'boundAt'>, now?: number): void;
    invalidate(params: StickyCompositeKeyParams): void;
    invalidateAccount(channelId: string, slotId: string): void;
}
