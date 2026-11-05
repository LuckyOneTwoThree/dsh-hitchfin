import type { HitchfinCatalogEntry } from '../adapter/hitchfin-adapter.js';
import type { ChannelSummary } from '../rpc/types.js';
import type { AccountPool } from './pool.js';

export interface MagpieDiscoveredModel {
  id: string;
  ownedBy: string;
  channelId: string;
}

export interface MagpieProbeResult {
  reachable: boolean;
  endpoint: string;
  models: MagpieDiscoveredModel[];
  channels: ChannelSummary[];
  error?: string;
}

export const DEFAULT_MAGPIE_ENDPOINT = 'http://127.0.0.1:3425';

export function inferChannelFromModel(
  modelId: string,
  ownedBy = '',
): {
  channelId: string;
  displayName: string;
  complianceTier: 'low' | 'medium' | 'high';
} {
  const lowerId = modelId.toLowerCase();
  const lowerOwner = ownedBy.toLowerCase();

  if (lowerOwner.includes('workbuddy') || lowerId.startsWith('workbuddy/')) {
    return {
      channelId: 'hitchfin-workbuddy',
      displayName: 'Hitchfin · WorkBuddy',
      complianceTier: 'medium',
    };
  }
  if (lowerOwner.includes('trae') || lowerId.startsWith('trae/')) {
    return {
      channelId: 'hitchfin-trae',
      displayName: 'Hitchfin · Trae CN',
      complianceTier: 'medium',
    };
  }
  if (lowerOwner.includes('zcode') || lowerId.startsWith('zcode/')) {
    return {
      channelId: 'hitchfin-zcode',
      displayName: 'Hitchfin · ZCode',
      complianceTier: 'medium',
    };
  }
  if (
    lowerOwner.includes('codex') ||
    lowerOwner.includes('openai') ||
    lowerId.includes('gpt-') ||
    lowerId.includes('codex') ||
    lowerId.startsWith('o1') ||
    lowerId.startsWith('o3') ||
    lowerId.startsWith('o4')
  ) {
    return {
      channelId: 'hitchfin-codex',
      displayName: 'Hitchfin · OpenAI Codex',
      complianceTier: 'low',
    };
  }
  if (lowerOwner.includes('copilot') || lowerId.startsWith('copilot/')) {
    return {
      channelId: 'hitchfin-copilot',
      displayName: 'Hitchfin · GitHub Copilot',
      complianceTier: 'low',
    };
  }
  if (lowerOwner.includes('anthropic') || lowerId.includes('claude')) {
    return {
      channelId: 'hitchfin-claude',
      displayName: 'Hitchfin · Claude',
      complianceTier: 'high',
    };
  }
  return {
    channelId: 'hitchfin-magpie',
    displayName: 'Hitchfin · Magpie Bridge',
    complianceTier: 'low',
  };
}

export async function probeMagpieGateway(
  endpoint = DEFAULT_MAGPIE_ENDPOINT,
  timeoutMs = 1500,
  customFetch: typeof fetch = fetch,
): Promise<MagpieProbeResult> {
  const baseUrl = endpoint.replace(/\/+$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await customFetch(`${baseUrl}/v1/models`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!res.ok) {
      return {
        reachable: false,
        endpoint: baseUrl,
        models: [],
        channels: [],
        error: `HTTP ${res.status}`,
      };
    }

    const body = (await res.json()) as {
      data?: Array<{ id?: string; owned_by?: string }>;
    };
    const rawModels = Array.isArray(body?.data) ? body.data : [];

    const channelMap = new Map<string, ChannelSummary>();
    const models: MagpieDiscoveredModel[] = [];

    for (const item of rawModels) {
      if (!item || typeof item.id !== 'string' || !item.id.trim()) continue;
      const ownedBy = typeof item.owned_by === 'string' ? item.owned_by : 'magpie';
      const inferred = inferChannelFromModel(item.id, ownedBy);

      models.push({
        id: item.id,
        ownedBy,
        channelId: inferred.channelId,
      });

      let ch = channelMap.get(inferred.channelId);
      if (!ch) {
        ch = {
          channelId: inferred.channelId,
          displayName: inferred.displayName,
          source: 'magpie-bridge',
          complianceTier: inferred.complianceTier,
          activeAccounts: 1,
          totalAccounts: 1,
          models: [],
        };
        channelMap.set(inferred.channelId, ch);
      }
      if (!ch.models.includes(item.id)) {
        ch.models.push(item.id);
      }
    }

    return {
      reachable: true,
      endpoint: baseUrl,
      models,
      channels: [...channelMap.values()],
    };
  } catch (err) {
    return {
      reachable: false,
      endpoint: baseUrl,
      models: [],
      channels: [],
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

export function buildCatalogEntriesFromMagpie(
  probe: MagpieProbeResult,
): HitchfinCatalogEntry[] {
  if (!probe.reachable || probe.channels.length === 0) {
    return [];
  }

  const entries: HitchfinCatalogEntry[] = [];
  for (const ch of probe.channels) {
    entries.push({
      provider: {
        id: ch.channelId,
        name: ch.displayName,
      },
      strategy: 'smart',
      models: ch.models.map((modelId) => ({
        info: {
          provider: ch.channelId,
          id: modelId,
          name: modelId,
          description: `Bridged via Magpie (${ch.displayName})`,
          inputModalities: ['text'],
        },
        resolved: {
          context: { contextWindow: 128_000 },
          defaultMaxTokens: 16_384,
        },
      })),
    });
  }

  return entries;
}

export function registerBridgeSlotsOnPool(
  probe: MagpieProbeResult,
  pool: AccountPool,
): void {
  if (!probe.reachable) return;
  for (const ch of probe.channels) {
    const existing = pool.listSlots(ch.channelId);
    if (existing.length === 0) {
      pool.registerSlot({
        slotId: 'magpie-bridge-default',
        channelId: ch.channelId,
        label: `${ch.displayName} (Bridge)`,
        state: 'Healthy',
        quotas: [
          {
            windowLabel: '5h',
            remainingPercent: 85,
            confidence: 'estimated',
          },
        ],
      });
    }
  }
}

