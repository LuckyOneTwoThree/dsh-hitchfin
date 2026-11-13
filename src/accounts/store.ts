import { createHash } from 'node:crypto'
import type { CredentialProvider, CredentialRecord } from '../types.js'

export interface AccountPayload {
  channelId: string
  accountId: string
  label: string
  auth: unknown
  plan?: string
  freeOnly: boolean
  /** Canonical model names; older records may still contain model ids. */
  hiddenModels?: string[]
  /** Optional HTTP(S) proxy for this account's channel requests. */
  proxy?: string
  /** Disabled accounts keep their data but never take part in routing. */
  enabled?: boolean
  /** Lower value means higher priority; missing values fall back to id order. */
  priority?: number
  createdAt: number
  updatedAt: number
}

/**
 * Deterministic account order: explicit priority first, then account id.
 * Old records without priority no longer depend on the host's record order.
 */
export function sortAccountsByPriority<T extends Pick<AccountPayload, 'accountId' | 'priority'>>(
  accounts: readonly T[],
): T[] {
  return [...accounts].sort((left, right) => {
    const lp = left.priority ?? Number.MAX_SAFE_INTEGER
    const rp = right.priority ?? Number.MAX_SAFE_INTEGER
    if (lp !== rp) return lp - rp
    return left.accountId.localeCompare(right.accountId)
  })
}

export type AccountAuth = unknown

const SCOPE = 'dsh-hitchfin'

/**
 * Host credential keys are `<scope>/<id>` and each segment must match
 * `^[a-z][a-z0-9-]*$`. The id half is `${channelId}-${accountId}`; a channel
 * id is fixed and lowercase, so validating the account id is what keeps a
 * user-supplied value from producing a key the credential store cannot parse
 * again (and would refuse at the next boot).
 */
const ACCOUNT_ID_PATTERN = /^[a-z][a-z0-9-]{0,63}$/
const KEY_SEGMENT_PATTERN = /^[a-z][a-z0-9-]*$/

export function isValidAccountId(accountId: string): boolean {
  return ACCOUNT_ID_PATTERN.test(accountId)
}

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
    ...(typeof candidate.proxy === 'string' && candidate.proxy.trim()
      ? { proxy: candidate.proxy.trim() }
      : {}),
    ...(typeof candidate.enabled === 'boolean' ? { enabled: candidate.enabled } : {}),
    ...(typeof candidate.priority === 'number' && Number.isFinite(candidate.priority)
      ? { priority: candidate.priority }
      : {}),
    createdAt: typeof candidate.createdAt === 'number' ? candidate.createdAt : Date.now(),
    updatedAt: typeof candidate.updatedAt === 'number' ? candidate.updatedAt : Date.now(),
  }
}

/**
 * A stable, non-reversible identity for an account's stored auth, used to
 * recognize the same account (or API key) on a second sign-in.
 *
 * API-key auth has no account id, so the key itself is the identity. Only the
 * SHA-256 digest is compared; the key never enters this value, a log line or
 * the settings payload.
 */
export function accountIdentity(auth: unknown): string {
  if (!auth || typeof auth !== 'object' || Array.isArray(auth)) return ''
  const record = auth as Record<string, unknown>
  if (record.type === 'api') {
    const key = typeof record.key === 'string' ? record.key.trim() : ''
    if (!key) return ''
    return `key:${createHash('sha256').update(key).digest('hex')}`
  }
  for (const field of ['accountId', 'uid', 'email']) {
    const value = record[field]
    if (typeof value === 'string' && value.trim()) return `${field}:${value.trim()}`
  }
  return ''
}

/** A stable, masked account label derived from the channel's auth payload. */
export function labelFromAuth(fallback: string, auth: unknown): string {
  if (!auth || typeof auth !== 'object' || Array.isArray(auth)) return fallback
  const record = auth as Record<string, unknown>
  const candidate = [record.accountId, record.uid, record.email, record.name].find(
    (value) => typeof value === 'string' && value.trim().length > 0,
  )
  if (typeof candidate !== 'string') return fallback
  const value = candidate.trim()
  // Short identities stay recognizable without printing the whole value: a
  // four-character uid used to be shown verbatim in the settings list.
  const masked =
    value.length > 8
      ? `${value.slice(0, 4)}…${value.slice(-4)}`
      : value.length > 2
        ? `${value.slice(0, 1)}…${value.slice(-1)}`
        : value
  return `${fallback} · ${masked}`
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

  async nextAccountId(channelId: string): Promise<string> {
    const accounts = await this.list(channelId)
    const used = new Set(accounts.map((account) => account.accountId))
    for (let i = 1; i < 1000; i += 1) {
      const id = `acct-${i}`
      if (!used.has(id)) return id
    }
    return `acct-${Date.now()}`
  }

  /**
   * The accounts a channel-wide setting write should touch. Reads (/state)
   * derive the setting from enabled accounts, but fall back to every account
   * when none is enabled; the write must use the same set or the toggle would
   * silently update nothing while the UI keeps showing the old value.
   */
  private async channelSettingTargets(channelId: string): Promise<readonly AccountPayload[]> {
    const accounts = await this.list(channelId)
    const enabled = accounts.filter((account) => account.enabled !== false)
    return enabled.length > 0 ? enabled : accounts
  }

  async setChannelFreeOnly(channelId: string, freeOnly: boolean): Promise<void> {
    // A disabled account keeps its own copy for whenever it is re-enabled, and
    // must not decide the toggle for the enabled ones.
    const accounts = await this.channelSettingTargets(channelId)
    for (const account of accounts) {
      await this.setFreeOnly(channelId, account.accountId, freeOnly)
    }
  }

  async setChannelHiddenModels(channelId: string, hidden: readonly string[]): Promise<void> {
    const accounts = await this.channelSettingTargets(channelId)
    for (const account of accounts) {
      await this.setHiddenModels(channelId, account.accountId, hidden)
    }
  }

  async setEnabled(channelId: string, accountId: string, enabled: boolean): Promise<void> {
    await this.update(channelId, accountId, (current) => ({ ...current, enabled }))
  }

  /** Persist the visible account order as explicit priorities. */
  async setPriorities(channelId: string, orderedIds: readonly string[]): Promise<void> {
    const existing = sortAccountsByPriority(await this.list(channelId))
    const byId = new Map(existing.map((account) => [account.accountId, account]))
    // Listed accounts come first in the requested order; anything the caller
    // omitted keeps its current priority order at the end. A partial list
    // must not leave two accounts sharing one priority.
    const listed = [...new Set(orderedIds.filter((id) => byId.has(id)))]
    const listedSet = new Set(listed)
    const ordered = [
      ...listed,
      ...existing.map((a) => a.accountId).filter((id) => !listedSet.has(id)),
    ]
    for (const [index, accountId] of ordered.entries()) {
      await this.update(channelId, accountId, (current) => ({
        ...current,
        priority: index,
      }))
    }
  }

  async setProxy(channelId: string, accountId: string, proxy?: string): Promise<void> {
    await this.update(channelId, accountId, (current) => {
      const next = { ...current }
      if (typeof proxy === 'string' && proxy.trim()) next.proxy = proxy.trim()
      else delete next.proxy
      return next
    })
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
    if (!KEY_SEGMENT_PATTERN.test(payload.channelId) || !isValidAccountId(payload.accountId)) {
      throw new TypeError(
        `dsh-hitchfin: refusing to write an account under a malformed credential key (${payload.channelId}/${payload.accountId})`,
      )
    }
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
