import { LlmError } from '@deepseek-ai/dsh-llm';
function scoreSmart(slot) {
    if (!slot.quotas || slot.quotas.length === 0)
        return 50;
    return Math.min(...slot.quotas.map((q) => q.remainingPercent));
}
function scorePace(slot, now) {
    if (!slot.quotas || slot.quotas.length === 0)
        return 50;
    let bestPaceScore = -Infinity;
    for (const q of slot.quotas) {
        if (q.resetAt) {
            const resetMs = Date.parse(q.resetAt);
            if (Number.isFinite(resetMs) && resetMs > now) {
                const hoursLeft = Math.max(0.25, (resetMs - now) / (3600 * 1000));
                // Higher remainingPercent with fewer hours left until reset gets higher priority
                const score = q.remainingPercent / hoursLeft;
                if (score > bestPaceScore)
                    bestPaceScore = score;
                continue;
            }
        }
        if (q.remainingPercent > bestPaceScore) {
            bestPaceScore = q.remainingPercent;
        }
    }
    return bestPaceScore;
}
export class GroupRouter {
    pool;
    cooldown;
    sticky;
    roundRobinCursors = new Map();
    groups = new Map();
    failoverCount = 0;
    constructor(pool, cooldown, sticky) {
        this.pool = pool;
        this.cooldown = cooldown;
        this.sticky = sticky;
    }
    getFailoverCount() {
        return this.failoverCount;
    }
    registerRoutingGroup(group) {
        this.groups.set(group.groupId, {
            ...group,
            members: group.members.map((m) => ({ ...m })),
        });
    }
    listRoutingGroups() {
        return [...this.groups.values()];
    }
    /**
     * Select a healthy account slot for the given channel/group and strategy.
     * Respects Sticky Session binding first unless the bound account is in Cooldown.
     */
    selectAccount(channelOrGroupId, modelId, strategy = 'smart', stickyParams, now = Date.now()) {
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
        const groupConfig = this.groups.get(channelOrGroupId);
        const effectiveStrategy = groupConfig?.strategy ?? strategy;
        const candidates = [];
        if (groupConfig && groupConfig.members.length > 0) {
            for (const member of groupConfig.members) {
                const memberSlots = this.pool
                    .listSlots(member.channelId)
                    .filter((slot) => this.cooldown.isSelectable(slot.channelId, slot.slotId, now));
                for (const slot of memberSlots) {
                    candidates.push({
                        slot,
                        targetModelId: member.modelId,
                        weight: member.weight ?? 1,
                    });
                }
            }
        }
        else {
            const directSlots = this.pool
                .listSlots(channelOrGroupId)
                .filter((slot) => this.cooldown.isSelectable(slot.channelId, slot.slotId, now));
            for (const slot of directSlots) {
                candidates.push({
                    slot,
                    targetModelId: modelId,
                    weight: 1,
                });
            }
        }
        if (candidates.length === 0) {
            throw new LlmError(`dsh-hitchfin: all account slots for "${channelOrGroupId}" are currently in cooldown or exhausted`, 'RATE_LIMIT', { status: 429, providerRetryAfterMs: 2000 });
        }
        let chosen;
        if (effectiveStrategy === 'order') {
            chosen = candidates[0];
        }
        else if (effectiveStrategy === 'rotate') {
            const cursor = this.roundRobinCursors.get(channelOrGroupId) ?? 0;
            chosen = candidates[cursor % candidates.length];
            this.roundRobinCursors.set(channelOrGroupId, cursor + 1);
        }
        else if (effectiveStrategy === 'pace') {
            chosen = [...candidates].sort((a, b) => scorePace(b.slot, now) * b.weight - scorePace(a.slot, now) * a.weight)[0];
        }
        else {
            // 'smart'
            chosen = [...candidates].sort((a, b) => scoreSmart(b.slot) * b.weight - scoreSmart(a.slot) * a.weight)[0];
        }
        if (stickyParams?.sessionId) {
            this.sticky.bind(stickyParams, {
                channelId: chosen.slot.channelId,
                slotId: chosen.slot.slotId,
                modelId: chosen.targetModelId,
            }, now);
        }
        return {
            channelId: chosen.slot.channelId,
            slotId: chosen.slot.slotId,
            modelId: chosen.targetModelId,
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
    recordFailureAndThrowForStepRetry(selection, upstreamStatus, upstreamMessage, cooldownDurationMs = 30_000, now = Date.now()) {
        this.cooldown.markCooldown(selection.channelId, selection.slotId, cooldownDurationMs, upstreamMessage, now);
        this.sticky.invalidateAccount(selection.channelId, selection.slotId);
        this.failoverCount += 1;
        const hasAlternateHealthy = this.pool
            .listSlots()
            .some((s) => this.cooldown.isSelectable(s.channelId, s.slotId, now));
        throw new LlmError(`dsh-hitchfin: slot ${selection.channelId}/${selection.slotId} failed (${upstreamStatus}: ${upstreamMessage}); switched to cooldown`, 'RATE_LIMIT', {
            status: 429,
            providerRetryAfterMs: hasAlternateHealthy ? 100 : 1500,
        });
    }
}
