import { type QuotaWindowSnapshot } from '../rpc/types.js';
import type { AccountPool } from './pool.js';
export interface DiscoveredSubscriptionAccount {
    id: string;
    source: 'magpie-logins' | 'codex-cli' | 'copilot-cli' | 'claude-cli';
    channelId: string;
    providerName: string;
    user: string;
    plan: string;
    hasToken: boolean;
    token?: string;
    refreshToken?: string;
    baseUrl: string;
    models: string[];
    candidateModels?: string[];
    quotas?: QuotaWindowSnapshot[];
    authType: 'oauth' | 'bearer' | 'api-key';
    slotId: string;
    label: string;
}
/**
 * Scan local disk for official subscription account logins (ChatGPT/Codex, Trae, WorkBuddy, ZCode, Copilot).
 * Reads real quota from quotas.json and candidate models from plugin-providers.json.
 * Never logs or exposes plaintext tokens.
 */
export declare function discoverLocalSubscriptionAccounts(): DiscoveredSubscriptionAccount[];
/**
 * Import discovered accounts into Hitchfin's AccountPool with real quotas and candidate models.
 */
export declare function importDiscoveredAccountsToPool(accountIds: string[] | 'all', pool: AccountPool): Promise<number>;
