import { LlmError } from '@deepseek-ai/dsh-llm';
import type { AccountPool } from '../channels/pool.js';
import type { AccountSlotSummary, RoutingStrategy } from '../rpc/types.js';
import type { CooldownTracker } from './cooldown.js';
import {
  type StickyCompositeKeyParams,
  StickySessionCache,
} from './sticky-cache.js';

export interface RouteSelection {
  channelId: string;
  slotId: string;
  modelId: string;
  fromSticky: boolean;
}

export class GroupRouter {
  private roundRobinCursors = new Map<string, number>();
  private failoverCount = 0;

  constructor(
    private readonly pool: AccountPool,
    private readonly cooldown: CooldownTracker,
    private readonly sticky: StickySessionCache,
  ) {}

  getFailoverCount(): number {
    return this.failoverCount;
  }

  /**
   * Select a healthy account slot for the given channel/group and strategy.
   * Respects Sticky Session binding first unless the bound account is in Cooldown.
   */
  selectAccount(
    channelId: string,
    modelId: string,
    strategy: RoutingStrategy = 'smart',
    stickyParams?: StickyCompositeKeyParams,
    now = Date.now(),
  ): RouteSelection {
    if (stickyParams?.sessionId) {
      const existing = this.sticky.get(stickyParams, now);
      if (existing) {
        return {
          channelId: existing.channelId,
          slotId: existing.slotId,
          modelId: existing.modelId,
          fromSticky: true,
        };
      }
    }

    const candidates = this.pool
      .listSlots(channelId)
      .filter((slot) =>
        this.cooldown.isSelectable(slot.channelId, slot.slotId, now),
      );

    if (candidates.length === 0) {
      throw new LlmError(
        `dsh-hitchfin: all account slots for channel "${channelId}" are currently in cooldown or exhausted`,
        'RATE_LIMIT',
        { status: 429, providerRetryAfterMs: 2000 },
      );
    }

    let chosen: AccountSlotSummary;

    if (strategy === 'order') {
      chosen = candidates[0];
    } else if (strategy === 'rotate') {
      const cursor = this.roundRobinCursors.get(channelId) ?? 0;
      chosen = candidates[cursor % candidates.length];
      this.roundRobinCursors.set(channelId, cursor + 1);
    } else if (strategy === 'smart' || strategy === 'pace') {
      chosen = [...candidates].sort((a, b) => {
        const minA = a.quotas.length
          ? Math.min(...a.quotas.map((q) => q.remainingPercent))
          : 50;
        const minB = b.quotas.length
          ? Math.min(...b.quotas.map((q) => q.remainingPercent))
          : 50;
        return minB - minA;
      })[0];
    } else {
      chosen = candidates[0];
    }

    if (stickyParams?.sessionId) {
      this.sticky.bind(
        stickyParams,
        {
          channelId: chosen.channelId,
          slotId: chosen.slotId,
          modelId,
        },
        now,
      );
    }

    return {
      channelId: chosen.channelId,
      slotId: chosen.slotId,
      modelId,
      fromSticky: false,
    };
  }

  /**
   * Handle a pre-first-byte rate-limit or transient server failure on a selected account:
   * 1. Marks the account in `Cooldown` so the next selection skips it;
   * 2. Invalidates any Sticky Session bound to that account;
   * 3. Throws an `LlmError` with `RATE_LIMIT` and `providerRetryAfterMs: 100` so
   *    `@deepseek-ai/dsh-llm-retry` cleanly retries at the Agent Step boundary and hits the next healthy slot.
   */
  recordFailureAndThrowForStepRetry(
    selection: RouteSelection,
    upstreamStatus: number,
    upstreamMessage: string,
    cooldownDurationMs = 30_000,
    now = Date.now(),
  ): never {
    this.cooldown.markCooldown(
      selection.channelId,
      selection.slotId,
      cooldownDurationMs,
      upstreamMessage,
      now,
    );
    this.sticky.invalidateAccount(selection.channelId, selection.slotId);
    this.failoverCount += 1;

    const hasAlternateHealthy = this.pool
      .listSlots(selection.channelId)
      .some((s) => this.cooldown.isSelectable(s.channelId, s.slotId, now));

    throw new LlmError(
      `dsh-hitchfin: slot ${selection.channelId}/${selection.slotId} failed (${upstreamStatus}: ${upstreamMessage}); switched to cooldown`,
      'RATE_LIMIT',
      {
        status: 429,
        providerRetryAfterMs: hasAlternateHealthy ? 100 : 1500,
      },
    );
  }
}
