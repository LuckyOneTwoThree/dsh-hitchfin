import { credentialKey, } from '@deepseek-ai/dsh-credentials';
export const HITCHFIN_CREDENTIAL_SCOPE = 'dsh-hitchfin';
export function accountCredentialKey(channelId, slotId) {
    const safeChannel = channelId.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const safeSlot = slotId.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    return credentialKey(HITCHFIN_CREDENTIAL_SCOPE, `${safeChannel}-acct-${safeSlot}`);
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
    listSlots(channelId) {
        const all = [...this.slots.values()];
        return channelId ? all.filter((s) => s.channelId === channelId) : all;
    }
    getSlot(channelId, slotId) {
        return this.slots.get(this.compositeId(channelId, slotId));
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
        if (!credentials)
            return undefined;
        const key = accountCredentialKey(channelId, slotId);
        const raw = await credentials.readRecord(key);
        return unwrapGrantPayload(raw);
    }
}
