export class CooldownTracker {
    health = new Map();
    key(channelId, slotId) {
        return `${channelId}::${slotId}`;
    }
    getHealth(channelId, slotId, now = Date.now()) {
        const k = this.key(channelId, slotId);
        const entry = this.health.get(k);
        if (!entry) {
            return { state: 'Healthy', consecutiveFailures: 0 };
        }
        if (entry.state === 'Cooldown' &&
            entry.cooldownUntil !== undefined &&
            now >= entry.cooldownUntil) {
            const recovered = {
                state: 'Healthy',
                consecutiveFailures: entry.consecutiveFailures,
            };
            this.health.set(k, recovered);
            return recovered;
        }
        return entry;
    }
    isSelectable(channelId, slotId, now = Date.now()) {
        const h = this.getHealth(channelId, slotId, now);
        return h.state === 'Healthy';
    }
    markHealthy(channelId, slotId) {
        this.health.set(this.key(channelId, slotId), {
            state: 'Healthy',
            consecutiveFailures: 0,
        });
    }
    markCooldown(channelId, slotId, durationMs, reason, now = Date.now()) {
        const k = this.key(channelId, slotId);
        const prev = this.health.get(k);
        this.health.set(k, {
            state: 'Cooldown',
            cooldownUntil: now + Math.max(100, durationMs),
            consecutiveFailures: (prev?.consecutiveFailures ?? 0) + 1,
            lastError: reason,
        });
    }
    markState(channelId, slotId, state, reason) {
        const k = this.key(channelId, slotId);
        const prev = this.health.get(k);
        this.health.set(k, {
            state,
            consecutiveFailures: prev?.consecutiveFailures ?? 0,
            lastError: reason,
        });
    }
}
