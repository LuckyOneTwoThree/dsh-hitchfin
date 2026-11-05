import { type CredentialProvider } from '@deepseek-ai/dsh-credentials';
import type { AccountSlotSummary, QuotaWindowSnapshot } from '../rpc/types.js';
export interface StoredAccountRecord {
    channelId: string;
    slotId: string;
    label: string;
    authType: 'oauth' | 'api-key' | 'community-plugin' | 'magpie-bridge';
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    apiKey?: string;
    quotas?: QuotaWindowSnapshot[];
    updatedAt: number;
}
export declare const HITCHFIN_CREDENTIAL_SCOPE = "dsh-hitchfin";
export declare function accountCredentialKey(channelId: string, slotId: string): import("@deepseek-ai/dsh-credentials").CredentialKey;
export declare function maskingVaultCredentialKey(): import("@deepseek-ai/dsh-credentials").CredentialKey;
export declare class AccountPool {
    private readonly getCredentials;
    private slots;
    constructor(getCredentials: () => CredentialProvider | undefined);
    private compositeId;
    registerSlot(summary: AccountSlotSummary): void;
    listSlots(channelId?: string): AccountSlotSummary[];
    getSlot(channelId: string, slotId: string): AccountSlotSummary | undefined;
    /**
     * Atomically read-modify-write an account credential record using DSH's cross-process locked
     * `ctx.credentials.modifyRecord(key, fn)` storing a `GrantRecord` (`{ kind: 'grant', payload }`).
     */
    modifyAccountCredential(channelId: string, slotId: string, mutate: (current: StoredAccountRecord | undefined) => Promise<StoredAccountRecord | undefined> | StoredAccountRecord | undefined): Promise<StoredAccountRecord | undefined>;
    readAccountCredential(channelId: string, slotId: string): Promise<StoredAccountRecord | undefined>;
}
