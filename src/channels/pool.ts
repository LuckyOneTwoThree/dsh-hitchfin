import {
  credentialKey,
  type CredentialProvider,
  type CredentialRecord,
} from '@deepseek-ai/dsh-credentials';
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

export const HITCHFIN_CREDENTIAL_SCOPE = 'dsh-hitchfin';

export function accountCredentialKey(channelId: string, slotId: string) {
  const safeChannel = channelId.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const safeSlot = slotId.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  return credentialKey(
    HITCHFIN_CREDENTIAL_SCOPE,
    `${safeChannel}-acct-${safeSlot}`,
  );
}

export function maskingVaultCredentialKey() {
  return credentialKey(HITCHFIN_CREDENTIAL_SCOPE, 'masking-vault');
}

function unwrapGrantPayload(
  record: CredentialRecord | undefined,
): StoredAccountRecord | undefined {
  if (!record || record.kind !== 'grant') return undefined;
  if (!record.payload || typeof record.payload !== 'object') return undefined;
  return record.payload as StoredAccountRecord;
}

export class AccountPool {
  private slots = new Map<string, AccountSlotSummary>();

  constructor(
    private readonly getCredentials: () => CredentialProvider | undefined,
  ) {}

  private compositeId(channelId: string, slotId: string): string {
    return `${channelId}::${slotId}`;
  }

  registerSlot(summary: AccountSlotSummary): void {
    this.slots.set(this.compositeId(summary.channelId, summary.slotId), {
      ...summary,
    });
  }

  listSlots(channelId?: string): AccountSlotSummary[] {
    const all = [...this.slots.values()];
    return channelId ? all.filter((s) => s.channelId === channelId) : all;
  }

  getSlot(channelId: string, slotId: string): AccountSlotSummary | undefined {
    return this.slots.get(this.compositeId(channelId, slotId));
  }

  /**
   * Atomically read-modify-write an account credential record using DSH's cross-process locked
   * `ctx.credentials.modifyRecord(key, fn)` storing a `GrantRecord` (`{ kind: 'grant', payload }`).
   */
  async modifyAccountCredential(
    channelId: string,
    slotId: string,
    mutate: (
      current: StoredAccountRecord | undefined,
    ) =>
      | Promise<StoredAccountRecord | undefined>
      | StoredAccountRecord
      | undefined,
  ): Promise<StoredAccountRecord | undefined> {
    const credentials = this.getCredentials();
    if (!credentials) {
      throw new Error('dsh-hitchfin: ctx.credentials service is not available');
    }
    const key = accountCredentialKey(channelId, slotId);
    const updated = await credentials.modifyRecord(
      key,
      async (raw: CredentialRecord | undefined) => {
        const current = unwrapGrantPayload(raw);
        const next = await mutate(current);
        if (next === undefined) return undefined;
        return {
          kind: 'grant',
          payload: next,
        };
      },
    );
    return unwrapGrantPayload(updated);
  }

  async readAccountCredential(
    channelId: string,
    slotId: string,
  ): Promise<StoredAccountRecord | undefined> {
    const credentials = this.getCredentials();
    if (!credentials) return undefined;
    const key = accountCredentialKey(channelId, slotId);
    const raw = await credentials.readRecord(key);
    return unwrapGrantPayload(raw);
  }
}
