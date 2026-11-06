import type { CredentialProvider, CredentialRecord } from '../types.js'

export interface AccountPayload {
  channelId: string
  accountId: string
  label: string
  auth: unknown
  plan?: string
  freeOnly: boolean
  hiddenModels?: string[]
  createdAt: number
  updatedAt: number
}

export type AccountAuth = unknown

const SCOPE = 'dsh-hitchfin'

export function accountKey(channelId: string, accountId: string): string {
  return `${SCOPE}/${channelId}-${accountId}`
}

export function normalizeStoredAuth(auth: unknown): unknown {
  if (!auth || typeof auth !== 'object' || Array.isArray(auth)) return auth
  const record = auth as Record<string, unknown>
  if (record.type !== 'success') return auth
  const { type: _type, provider: _provider, refresh, access, expires, ...extra } = record
  return {
    type: 'oauth',
    ...(typeof refresh === 'string' ? { refresh } : {}),
    ...(typeof access === 'string' ? { access } : {}),
    ...(typeof expires === 'number' ? { expires } : {}),
    ...extra,
  }
}

function parsePayload(record: CredentialRecord | undefined): AccountPayload | undefined {
  if (!record || record.kind !== 'grant') return undefined
  const payload = record.payload
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined
  const candidate = payload as Partial<AccountPayload>
  if (
    typeof candidate.channelId !== 'string' ||
    typeof candidate.accountId !== 'string' ||
    typeof candidate.label !== 'string'
  ) {
    return undefined
  }
  return {
    channelId: candidate.channelId,
    accountId: candidate.accountId,
    label: candidate.label,
    auth: normalizeStoredAuth(candidate.auth),
    ...(typeof candidate.plan === 'string' ? { plan: candidate.plan } : {}),
    freeOnly: candidate.freeOnly !== false,
    ...(Array.isArray(candidate.hiddenModels)
      ? { hiddenModels: candidate.hiddenModels.filter((x): x is string => typeof x === 'string') }
      : {}),
    createdAt: typeof candidate.createdAt === 'number' ? candidate.createdAt : Date.now(),
    updatedAt: typeof candidate.updatedAt === 'number' ? candidate.updatedAt : Date.now(),
  }
}

export class AccountStore {
  constructor(private readonly credentials?: CredentialProvider) {}

  get available(): boolean {
    return this.credentials !== undefined
  }

  async list(channelId?: string): Promise<readonly AccountPayload[]> {
    if (!this.credentials) return []
    const entries = await this.credentials.listRecords()
    const out: AccountPayload[] = []
    for (const entry of entries) {
      if (!entry.key.startsWith(`${SCOPE}/`)) continue
      const record = await this.credentials.readRecord(entry.key)
      const payload = parsePayload(record)
      if (!payload) continue
      if (channelId && payload.channelId !== channelId) continue
      out.push(payload)
    }
    return out
  }

  async get(channelId: string, accountId: string): Promise<AccountPayload | undefined> {
    if (!this.credentials) return undefined
    const record = await this.credentials.readRecord(accountKey(channelId, accountId))
    return parsePayload(record)
  }

  /** Repair records written before the OpenCode callback shape was normalized. */
  async migrate(): Promise<number> {
    if (!this.credentials) return 0
    const entries = await this.credentials.listRecords()
    let changed = 0
    for (const entry of entries) {
      if (!entry.key.startsWith(`${SCOPE}/`)) continue
      await this.credentials.modifyRecord(entry.key, async (current) => {
        if (!current || current.kind !== 'grant') return undefined
        if (!current.payload || typeof current.payload !== 'object' || Array.isArray(current.payload)) {
          return undefined
        }
        const payload = current.payload as Record<string, unknown>
        const auth = payload.auth
        if (!auth || typeof auth !== 'object' || (auth as Record<string, unknown>).type !== 'success') {
          return undefined
        }
        changed += 1
        return {
          kind: 'grant',
          payload: { ...payload, auth: normalizeStoredAuth(auth), updatedAt: Date.now() },
        }
      })
    }
    return changed
  }

  async save(payload: AccountPayload): Promise<AccountPayload> {
    if (!this.credentials) throw new Error('DSH credentials service is not available')
    const now = Date.now()
    const next: AccountPayload = {
      ...payload,
      auth: normalizeStoredAuth(payload.auth),
      freeOnly: payload.freeOnly !== false,
      createdAt: payload.createdAt || now,
      updatedAt: now,
    }
    await this.credentials.modifyRecord(accountKey(next.channelId, next.accountId), async () => ({
      kind: 'grant',
      payload: next,
    }))
    return next
  }

  async updateAuth(channelId: string, accountId: string, auth: AccountAuth): Promise<void> {
    if (!this.credentials) return
    await this.credentials.modifyRecord(accountKey(channelId, accountId), async (current) => {
      const existing = parsePayload(current)
      if (!existing) return undefined
      return {
        kind: 'grant',
        payload: { ...existing, auth: normalizeStoredAuth(auth), updatedAt: Date.now() },
      }
    })
  }

  async setFreeOnly(channelId: string, accountId: string, freeOnly: boolean): Promise<void> {
    await this.update(channelId, accountId, (current) => ({ ...current, freeOnly }))
  }

  async setHiddenModels(channelId: string, accountId: string, hidden: readonly string[]): Promise<void> {
    await this.update(channelId, accountId, (current) => ({ ...current, hiddenModels: [...hidden] }))
  }

  async update(
    channelId: string,
    accountId: string,
    mutate: (current: AccountPayload) => AccountPayload,
  ): Promise<void> {
    if (!this.credentials) return
    await this.credentials.modifyRecord(accountKey(channelId, accountId), async (current) => {
      const existing = parsePayload(current)
      if (!existing) return undefined
      return {
        kind: 'grant',
        payload: { ...mutate(existing), updatedAt: Date.now() },
      }
    })
  }

  async delete(channelId: string, accountId: string): Promise<void> {
    if (!this.credentials) return
    await this.credentials.deleteRecord(accountKey(channelId, accountId))
  }
}
