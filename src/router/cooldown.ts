import type { AccountHealthState } from '../rpc/types.js';

export interface AccountRuntimeHealth {
  state: AccountHealthState;
  cooldownUntil?: number;
  consecutiveFailures: number;
  lastError?: string;
}

export class CooldownTracker {
  private health = new Map<string, AccountRuntimeHealth>();

  private key(channelId: string, slotId: string): string {
    return `${channelId}::${slotId}`;
  }

  getHealth(channelId: string, slotId: string, now = Date.now()): AccountRuntimeHealth {
    const k = this.key(channelId, slotId);
    const entry = this.health.get(k);
    if (!entry) {
      return { state: 'Healthy', consecutiveFailures: 0 };
    }
    if (
      entry.state === 'Cooldown' &&
      entry.cooldownUntil !== undefined &&
      now >= entry.cooldownUntil
    ) {
      const recovered: AccountRuntimeHealth = {
        state: 'Healthy',
        consecutiveFailures: entry.consecutiveFailures,
      };
      this.health.set(k, recovered);
      return recovered;
    }
    return entry;
  }

  isSelectable(channelId: string, slotId: string, now = Date.now()): boolean {
    const h = this.getHealth(channelId, slotId, now);
    return h.state === 'Healthy';
  }

  markHealthy(channelId: string, slotId: string): void {
    this.health.set(this.key(channelId, slotId), {
      state: 'Healthy',
      consecutiveFailures: 0,
    });
  }

  markCooldown(
    channelId: string,
    slotId: string,
    durationMs: number,
    reason?: string,
    now = Date.now(),
  ): void {
    const k = this.key(channelId, slotId);
    const prev = this.health.get(k);
    this.health.set(k, {
      state: 'Cooldown',
      cooldownUntil: now + Math.max(100, durationMs),
      consecutiveFailures: (prev?.consecutiveFailures ?? 0) + 1,
      lastError: reason,
    });
  }

  markState(
    channelId: string,
    slotId: string,
    state: AccountHealthState,
    reason?: string,
  ): void {
    const k = this.key(channelId, slotId);
    const prev = this.health.get(k);
    this.health.set(k, {
      state,
      consecutiveFailures: prev?.consecutiveFailures ?? 0,
      lastError: reason,
    });
  }
}
