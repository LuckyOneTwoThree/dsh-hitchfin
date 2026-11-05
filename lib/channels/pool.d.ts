import { type CredentialProvider } from '@deepseek-ai/dsh-credentials';
import type { AccountSlotSummary, AutonomousAccountConfig, QuotaWindowSnapshot } from '../rpc/types.js';
export interface StoredAccountRecord {
    channelId: string;
    slotId: string;
    label: string;
    authType: 'oauth' | 'api-key' | 'community-plugin' | 'magpie-bridge' | 'bearer';
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    apiKey?: string;
    baseUrl?: string;
    models?: string[];
    candidateModels?: string[];
    quotas?: QuotaWindowSnapshot[];
    updatedAt: number;
}
export declare const HITCHFIN_CREDENTIAL_SCOPE = "dsh-hitchfin";
export declare function accountCredentialKey(channelId: string, slotId: string): import("@deepseek-ai/dsh-credentials").CredentialKey;
export declare function accountRegistryCredentialKey(): import("@deepseek-ai/dsh-credentials").CredentialKey;
export declare function maskingVaultCredentialKey(): import("@deepseek-ai/dsh-credentials").CredentialKey;
export declare class AccountPool {
    private readonly getCredentials;
    private slots;
    private autonomousAccounts;
    constructor(getCredentials: () => CredentialProvider | undefined);
    private compositeId;
    registerSlot(summary: AccountSlotSummary): void;
    removeSlot(channelId: string, slotId: string): boolean;
    listSlots(channelId?: string): AccountSlotSummary[];
    getSlot(channelId: string, slotId: string): AccountSlotSummary | undefined;
    listAutonomousAccounts(): AutonomousAccountConfig[];
    getAutonomousAccount(channelId: string, slotId: string): AutonomousAccountConfig | undefined;
    /**
     * Atomically read-modify-write an account credential record using DSH's cross-process locked
     * `ctx.credentials.modifyRecord(key, fn)` storing a `GrantRecord` (`{ kind: 'grant', payload }`).
     */
    modifyAccountCredential(channelId: string, slotId: string, mutate: (current: StoredAccountRecord | undefined) => Promise<StoredAccountRecord | undefined> | StoredAccountRecord | undefined): Promise<StoredAccountRecord | undefined>;
    readAccountCredential(channelId: string, slotId: string): Promise<StoredAccountRecord | undefined>;
    deleteAccountCredential(channelId: string, slotId: string): Promise<boolean>;
    /**
     * Save or update an autonomous subscription account.
     * Persists the token into `accountCredentialKey` and updates `accounts-registry`.
     */
    addAutonomousAccount(account: AutonomousAccountConfig & {
        quotas?: QuotaWindowSnapshot[];
    }): Promise<void>;
    /**
     * Update the enabled model list for an account (model visibility toggle).
     */
    updateAccountModels(channelId: string, slotId: string, models: string[]): Promise<boolean>;
    /**
     * Remove an autonomous account and delete its credential record.
     */
    removeAutonomousAccount(channelId: string, slotId: string): Promise<boolean>;
    private saveAccountsRegistry;
    /**
     * Load previously persisted autonomous accounts from `ctx.credentials`.
     */
    loadPersistedAccounts(): Promise<AutonomousAccountConfig[]>;
}
