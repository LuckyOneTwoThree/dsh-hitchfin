import { credentialKey, } from '@deepseek-ai/dsh-credentials';
export const HITCHFIN_CREDENTIAL_SCOPE = 'dsh-hitchfin';
export function accountCredentialKey(channelId, slotId) {
    const safeChannel = channelId.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const safeSlot = slotId.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    return credentialKey(HITCHFIN_CREDENTIAL_SCOPE, `${safeChannel}-acct-${safeSlot}`);
}
export function accountRegistryCredentialKey() {
    return credentialKey(HITCHFIN_CREDENTIAL_SCOPE, 'accounts-registry');
}
export function maskingVaultCredentialKey() {
    return credentialKey(HITCHFIN_CREDENTIAL_SCOPE, 'masking-vault');
}
function unwrapGrantPayload(record) {
    if (!record || record.kind !== 'grant')
        return undefined;
    if (!record.payload || typeof record.payload !== 'object')
        return undefined;
    return record.payload;
}
export class AccountPool {
    getCredentials;
    slots = new Map();
    autonomousAccounts = new Map();
    constructor(getCredentials) {
        this.getCredentials = getCredentials;
    }
    compositeId(channelId, slotId) {
        return `${channelId}::${slotId}`;
    }
    registerSlot(summary) {
        this.slots.set(this.compositeId(summary.channelId, summary.slotId), {
            ...summary,
        });
    }
    removeSlot(channelId, slotId) {
        return this.slots.delete(this.compositeId(channelId, slotId));
    }
    listSlots(channelId) {
        const all = [...this.slots.values()];
        if (!channelId)
            return all;
        const bare = channelId.replace(/^hitchfin[-/]/, '');
        return all.filter((s) => s.channelId === channelId ||
            s.channelId === bare ||
            `hitchfin-${s.channelId}` === channelId ||
            `hitchfin/${s.channelId}` === channelId);
    }
    getSlot(channelId, slotId) {
        return this.slots.get(this.compositeId(channelId, slotId));
    }
    listAutonomousAccounts() {
        return [...this.autonomousAccounts.values()];
    }
    getAutonomousAccount(channelId, slotId) {
        return this.autonomousAccounts.get(this.compositeId(channelId, slotId));
    }
    /**
     * Atomically read-modify-write an account credential record using DSH's cross-process locked
     * `ctx.credentials.modifyRecord(key, fn)` storing a `GrantRecord` (`{ kind: 'grant', payload }`).
     */
    async modifyAccountCredential(channelId, slotId, mutate) {
        const credentials = this.getCredentials();
        if (!credentials) {
            throw new Error('dsh-hitchfin: ctx.credentials service is not available');
        }
        const key = accountCredentialKey(channelId, slotId);
        const updated = await credentials.modifyRecord(key, async (raw) => {
            const current = unwrapGrantPayload(raw);
            const next = await mutate(current);
            if (next === undefined)
                return undefined;
            return {
                kind: 'grant',
                payload: next,
            };
        });
        return unwrapGrantPayload(updated);
    }
    async readAccountCredential(channelId, slotId) {
        const credentials = this.getCredentials();
        if (!credentials) {
            // In-memory fallback if credentials service is absent
            const local = this.autonomousAccounts.get(this.compositeId(channelId, slotId));
            if (local) {
                return {
                    channelId: local.channelId,
                    slotId: local.slotId,
                    label: local.label,
                    authType: local.authType,
                    apiKey: local.apiKey,
                    accessToken: local.accessToken,
                    refreshToken: local.refreshToken,
                    baseUrl: local.baseUrl,
                    models: local.models,
                    updatedAt: local.updatedAt,
                };
            }
            return undefined;
        }
        const key = accountCredentialKey(channelId, slotId);
        const raw = await credentials.readRecord(key);
        return unwrapGrantPayload(raw);
    }
    async deleteAccountCredential(channelId, slotId) {
        const credentials = this.getCredentials();
        if (credentials) {
            const key = accountCredentialKey(channelId, slotId);
            await credentials.modifyRecord(key, async () => undefined);
        }
        this.removeSlot(channelId, slotId);
        return true;
    }
    /**
     * Save or update an autonomous subscription account.
     * Persists the token into `accountCredentialKey` and updates `accounts-registry`.
     */
    async addAutonomousAccount(account) {
        const cid = this.compositeId(account.channelId, account.slotId);
        this.autonomousAccounts.set(cid, { ...account });
        // 1. Register active slot in pool
        this.registerSlot({
            slotId: account.slotId,
            channelId: account.channelId,
            label: account.label,
            state: 'Healthy',
            quotas: [
                {
                    windowLabel: '额度正常',
                    remainingPercent: 100,
                    confidence: 'exact',
                },
            ],
            lastUsedAt: Date.now(),
            baseUrl: account.baseUrl,
            models: account.models ? [...account.models] : undefined,
        });
        // 2. Persist to credentials if service is present
        const credentials = this.getCredentials();
        if (credentials) {
            await this.modifyAccountCredential(account.channelId, account.slotId, () => ({
                channelId: account.channelId,
                slotId: account.slotId,
                label: account.label,
                authType: account.authType,
                apiKey: account.apiKey,
                accessToken: account.accessToken,
                refreshToken: account.refreshToken,
                baseUrl: account.baseUrl,
                models: account.models ? [...account.models] : undefined,
                updatedAt: account.updatedAt,
            }));
            await this.saveAccountsRegistry();
        }
    }
    /**
     * Remove an autonomous account and delete its credential record.
     */
    async removeAutonomousAccount(channelId, slotId) {
        const cid = this.compositeId(channelId, slotId);
        this.autonomousAccounts.delete(cid);
        await this.deleteAccountCredential(channelId, slotId);
        const credentials = this.getCredentials();
        if (credentials) {
            await this.saveAccountsRegistry();
        }
        return true;
    }
    async saveAccountsRegistry() {
        const credentials = this.getCredentials();
        if (!credentials)
            return;
        const key = accountRegistryCredentialKey();
        const records = [...this.autonomousAccounts.values()].map((a) => ({
            channelId: a.channelId,
            slotId: a.slotId,
            label: a.label,
            authType: a.authType,
            baseUrl: a.baseUrl,
            models: a.models,
            updatedAt: a.updatedAt,
        }));
        await credentials.modifyRecord(key, async () => ({
            kind: 'grant',
            payload: {
                accounts: records,
                updatedAt: Date.now(),
            },
        }));
    }
    /**
     * Load previously persisted autonomous accounts from `ctx.credentials`.
     */
    async loadPersistedAccounts() {
        const credentials = this.getCredentials();
        if (!credentials) {
            return [...this.autonomousAccounts.values()];
        }
        try {
            const key = accountRegistryCredentialKey();
            const raw = await credentials.readRecord(key);
            if (!raw || raw.kind !== 'grant' || !raw.payload) {
                return [...this.autonomousAccounts.values()];
            }
            const payload = raw.payload;
            if (!Array.isArray(payload.accounts)) {
                return [...this.autonomousAccounts.values()];
            }
            for (const entry of payload.accounts) {
                const cred = await this.readAccountCredential(entry.channelId, entry.slotId);
                const rawAuth = entry.authType ?? cred?.authType;
                const safeAuth = rawAuth === 'oauth' || rawAuth === 'bearer' ? rawAuth : 'api-key';
                const config = {
                    channelId: entry.channelId,
                    slotId: entry.slotId,
                    label: entry.label,
                    authType: safeAuth,
                    apiKey: cred?.apiKey,
                    accessToken: cred?.accessToken,
                    refreshToken: cred?.refreshToken,
                    baseUrl: entry.baseUrl ?? cred?.baseUrl,
                    models: entry.models ?? cred?.models,
                    updatedAt: entry.updatedAt ?? Date.now(),
                };
                const cid = this.compositeId(entry.channelId, entry.slotId);
                this.autonomousAccounts.set(cid, config);
                this.registerSlot({
                    slotId: entry.slotId,
                    channelId: entry.channelId,
                    label: entry.label,
                    state: 'Healthy',
                    quotas: [
                        {
                            windowLabel: '额度正常',
                            remainingPercent: 100,
                            confidence: 'exact',
                        },
                    ],
                    lastUsedAt: config.updatedAt,
                    baseUrl: config.baseUrl,
                    models: config.models ? [...config.models] : undefined,
                });
            }
        }
        catch {
            // In case credentials service has transient read issue, preserve in-memory
        }
        return [...this.autonomousAccounts.values()];
    }
}
