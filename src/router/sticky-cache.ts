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

export function formatStickyCompositeKey(params: StickyCompositeKeyParams): string {
  const sessionPart = params.sessionId ?? 'ephemeral';
  const effortPart = params.reasoningEffort ?? 'default';
  return `${sessionPart}::${params.providerId}::${params.modelId}::${effortPart}`;
}

export class StickySessionCache {
  private bindings = new Map<string, StickyBinding>();

  constructor(
    private readonly cooldown: CooldownTracker,
    private readonly ttlMs = 30 * 60 * 1000,
  ) {}

  get(
    params: StickyCompositeKeyParams,
    now = Date.now(),
  ): StickyBinding | undefined {
    if (!params.sessionId) return undefined;
    const key = formatStickyCompositeKey(params);
    const binding = this.bindings.get(key);
    if (!binding) return undefined;

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

  bind(
    params: StickyCompositeKeyParams,
    binding: Omit<StickyBinding, 'boundAt'>,
    now = Date.now(),
  ): void {
    if (!params.sessionId) return;
    const key = formatStickyCompositeKey(params);
    this.bindings.set(key, {
      ...binding,
      boundAt: now,
    });
  }

  invalidate(params: StickyCompositeKeyParams): void {
    const key = formatStickyCompositeKey(params);
    this.bindings.delete(key);
  }

  invalidateAccount(channelId: string, slotId: string): void {
    for (const [key, value] of this.bindings.entries()) {
      if (value.channelId === channelId && value.slotId === slotId) {
        this.bindings.delete(key);
      }
    }
  }
}
