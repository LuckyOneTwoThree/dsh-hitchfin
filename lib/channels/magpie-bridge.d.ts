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
export declare const DEFAULT_MAGPIE_ENDPOINT = "http://127.0.0.1:3425";
export declare function inferChannelFromModel(modelId: string, ownedBy?: string): {
    channelId: string;
    displayName: string;
    complianceTier: 'low' | 'medium' | 'high';
};
export declare function probeMagpieGateway(rawEndpoint?: unknown, timeoutMs?: number, customFetch?: typeof fetch): Promise<MagpieProbeResult>;
export declare function buildCatalogEntriesFromMagpie(probe: MagpieProbeResult): HitchfinCatalogEntry[];
export declare function registerBridgeSlotsOnPool(probe: MagpieProbeResult, pool: AccountPool): void;
