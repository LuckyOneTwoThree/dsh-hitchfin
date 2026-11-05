import type { AccountHealthState } from '../rpc/types.js';
export interface AccountRuntimeHealth {
    state: AccountHealthState;
    cooldownUntil?: number;
    consecutiveFailures: number;
    lastError?: string;
}
export declare class CooldownTracker {
    private health;
    private key;
    getHealth(channelId: string, slotId: string, now?: number): AccountRuntimeHealth;
    isSelectable(channelId: string, slotId: string, now?: number): boolean;
    markHealthy(channelId: string, slotId: string): void;
    markCooldown(channelId: string, slotId: string, durationMs: number, reason?: string, now?: number): void;
    markState(channelId: string, slotId: string, state: AccountHealthState, reason?: string): void;
}
