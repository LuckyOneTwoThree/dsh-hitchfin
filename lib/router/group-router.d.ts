import type { AccountPool } from '../channels/pool.js';
import type { RoutingGroupConfig, RoutingStrategy } from '../rpc/types.js';
import type { CooldownTracker } from './cooldown.js';
import { type StickyCompositeKeyParams, StickySessionCache } from './sticky-cache.js';
export interface RouteSelection {
    channelId: string;
    slotId: string;
    modelId: string;
    fromSticky: boolean;
}
export declare class GroupRouter {
    private readonly pool;
    private readonly cooldown;
    private readonly sticky;
    private roundRobinCursors;
    private groups;
    private failoverCount;
    constructor(pool: AccountPool, cooldown: CooldownTracker, sticky: StickySessionCache);
    getFailoverCount(): number;
    registerRoutingGroup(group: RoutingGroupConfig): void;
    listRoutingGroups(): RoutingGroupConfig[];
    /**
     * Select a healthy account slot for the given channel/group and strategy.
     * Respects Sticky Session binding first unless the bound account is in Cooldown.
     */
    selectAccount(channelOrGroupId: string, modelId: string, strategy?: RoutingStrategy, stickyParams?: StickyCompositeKeyParams, now?: number): RouteSelection;
    /**
     * Handle a pre-first-byte rate-limit or transient server failure on a selected account:
     * 1. Marks the account in `Cooldown` so the next selection skips it;
     * 2. Invalidates any Sticky Session bound to that account;
     * 3. Throws an `LlmError` with `RATE_LIMIT` and `providerRetryAfterMs: 100` so
     *    `@deepseek-ai/dsh-llm-retry` cleanly retries at the Agent Step boundary and hits the next healthy slot.
     */
    recordFailureAndThrowForStepRetry(selection: RouteSelection, upstreamStatus: number, upstreamMessage: string, cooldownDurationMs?: number, now?: number): never;
}
