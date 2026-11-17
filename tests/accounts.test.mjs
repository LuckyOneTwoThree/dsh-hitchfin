import './_fresh.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { AccountStore, accountIdentity, isValidAccountId, labelFromAuth, sortAccountsByPriority } from '../lib/accounts/store.js'

function fakeCredentials() {
  const records = new Map()
  return {
    records,
    async listRecords() {
      return [...records.keys()].map((key) => ({ key }))
    },
    async readRecord(key) {
      return records.get(key)
    },
    async modifyRecord(key, mutate) {
      const next = await mutate(records.get(key))
      if (next !== undefined) records.set(key, next)
      return next
    },
    async deleteRecord(key) {
      records.delete(key)
    },
  }
}

function account(accountId, overrides = {}) {
  return {
    channelId: 'workbuddy-cn',
    accountId,
    label: `WorkBuddy · ${accountId}`,
    auth: { type: 'oauth', access: `token-${accountId}`, accountId: `user-${accountId}` },
    freeOnly: true,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

test('labelFromAuth masks the signed-in identity', () => {
  assert.equal(
    labelFromAuth('WorkBuddy CN', { accountId: 'abcdef1234567890' }),
    'WorkBuddy CN · abcd…7890',
  )
  // Short identities are masked too: a four-character uid used to be printed
  // verbatim in the settings list.
  assert.equal(labelFromAuth('WorkBuddy CN', { accountId: 'short' }), 'WorkBuddy CN · s…t')
  assert.equal(labelFromAuth('WorkBuddy CN', { accountId: 'ab' }), 'WorkBuddy CN · ab')
  assert.equal(labelFromAuth('WorkBuddy CN', {}), 'WorkBuddy CN')
  assert.equal(labelFromAuth('WorkBuddy CN', undefined), 'WorkBuddy CN')
})

test('accountIdentity recognizes an account or an API key without exposing it', () => {
  assert.equal(
    accountIdentity({ type: 'oauth', accountId: 'user-1' }),
    accountIdentity({ type: 'oauth', accountId: 'user-1' }),
  )
  assert.notEqual(
    accountIdentity({ type: 'oauth', accountId: 'user-1' }),
    accountIdentity({ type: 'oauth', accountId: 'user-2' }),
  )

  const key = 'sk-abcdefghijklmnop'
  const identity = accountIdentity({ type: 'api', key })
  assert.ok(identity.startsWith('key:'))
  assert.equal(identity.includes(key), false)
  assert.equal(identity, accountIdentity({ type: 'api', key }))
  assert.notEqual(identity, accountIdentity({ type: 'api', key: 'sk-other-key' }))
  // The key is trimmed before hashing so a stray space cannot fork an account.
  assert.equal(identity, accountIdentity({ type: 'api', key: `  ${key}  ` }))
  assert.equal(accountIdentity({ type: 'api', key: '' }), '')
  assert.equal(accountIdentity(undefined), '')
})

test('store refuses an account id that would produce an invalid credential key', async () => {
  const store = new AccountStore(fakeCredentials())
  assert.equal(isValidAccountId('acct-1'), true)
  assert.equal(isValidAccountId('BAD_ID'), false)
  assert.equal(isValidAccountId('a/b'), false)
  await assert.rejects(() => store.save(account('BAD_ID')), /malformed credential key/)
  await assert.rejects(() => store.save(account('a/b')), /malformed credential key/)
})

test('store keeps multiple accounts per channel and allocates the next id', async () => {
  const credentials = fakeCredentials()
  const store = new AccountStore(credentials)
  await store.save(account('acct-1'))
  await store.save(account('acct-2'))

  const list = await store.list('workbuddy-cn')
  assert.deepEqual(list.map((entry) => entry.accountId).sort(), ['acct-1', 'acct-2'])
  assert.equal(await store.nextAccountId('workbuddy-cn'), 'acct-3')

  await store.delete('workbuddy-cn', 'acct-2')
  assert.deepEqual((await store.list('workbuddy-cn')).map((entry) => entry.accountId), [
    'acct-1',
  ])
  assert.equal(await store.nextAccountId('workbuddy-cn'), 'acct-2')
})

test('channel-wide free-only, hidden models and proxy apply per account', async () => {
  const parameters = fakeCredentials()
  const store = new AccountStore(parameters)
  await store.save(account('acct-1', { freeOnly: false }))
  await store.save(account('acct-2', { freeOnly: false }))

  await store.setChannelFreeOnly('workbuddy-cn', true)
  await store.setChannelHiddenModels('workbuddy-cn', ['paid-model'])
  const updated = await store.list('workbuddy-cn')
  assert.equal(updated.every((entry) => entry.freeOnly === true), true)
  assert.equal(updated.every((entry) => entry.hiddenModels?.includes('paid-model')), true)

  await store.setProxy('workbuddy-cn', 'acct-1', ' http://127.0.0.1:7890 ')
  const withProxy = await store.get('workbuddy-cn', 'acct-1')
  assert.equal(withProxy.proxy, 'http://127.0.0.1:7890')

  await store.setProxy('workbuddy-cn', 'acct-1', '')
  assert.equal((await store.get('workbuddy-cn', 'acct-1')).proxy, undefined)
})

test('store normalizes OpenCode success auth into oauth', async () => {
  const credentials = fakeCredentials()
  const store = new AccountStore(credentials)
  await store.save(
    account('acct-1', {
      auth: { type: 'success', provider: 'workbuddy', refresh: 'r', access: 'a' },
    }),
  )
  const stored = await store.get('workbuddy-cn', 'acct-1')
  assert.equal(stored.auth.type, 'oauth')
  assert.equal(stored.auth.refresh, 'r')
  assert.equal(stored.auth.access, 'a')
})

test('a partial order list appends the omitted accounts without duplicate priorities', async () => {
  const store = new AccountStore(fakeCredentials())
  await store.save(account('acct-1'))
  await store.save(account('acct-2'))
  await store.save(account('acct-3'))

  await store.setPriorities('workbuddy-cn', ['acct-3', 'acct-1'])

  const list = sortAccountsByPriority(await store.list('workbuddy-cn'))
  assert.deepEqual(
    list.map((entry) => entry.accountId),
    ['acct-3', 'acct-1', 'acct-2'],
  )
  assert.deepEqual(
    list.map((entry) => entry.priority),
    [0, 1, 2],
  )
})

test('channel-wide settings leave disabled accounts untouched', async () => {
  const store = new AccountStore(fakeCredentials())
  await store.save(account('acct-1', { enabled: true }))
  await store.save(account('acct-2', { enabled: false, freeOnly: false }))

  await store.setChannelFreeOnly('workbuddy-cn', true)
  await store.setChannelHiddenModels('workbuddy-cn', ['paid-model'])

  assert.equal((await store.get('workbuddy-cn', 'acct-1')).freeOnly, true)
  assert.equal((await store.get('workbuddy-cn', 'acct-1')).hiddenModels?.includes('paid-model'), true)
  // The disabled account keeps its own copy for whenever it is re-enabled.
  assert.equal((await store.get('workbuddy-cn', 'acct-2')).freeOnly, false)
  assert.equal((await store.get('workbuddy-cn', 'acct-2')).hiddenModels, undefined)
})

test('channel-wide settings still apply when every account is disabled', async () => {
  const store = new AccountStore(fakeCredentials())
  await store.save(account('acct-1', { enabled: false, freeOnly: false }))
  await store.save(account('acct-2', { enabled: false, freeOnly: false }))

  // /state derives the toggle from all accounts when none is enabled, so the
  // write has to target all of them as well.
  await store.setChannelFreeOnly('workbuddy-cn', true)
  await store.setChannelHiddenModels('workbuddy-cn', ['paid-model'])

  const accounts = await store.list('workbuddy-cn')
  assert.equal(accounts.every((entry) => entry.freeOnly === true), true)
  assert.equal(accounts.every((entry) => entry.hiddenModels?.includes('paid-model')), true)
  assert.equal(accounts.every((entry) => entry.enabled === false), true)
})

test('save merges fresh auth into the live record instead of a stale snapshot', async () => {
  const store = new AccountStore(fakeCredentials())
  const snapshot = await store.save(account('acct-1'))

  // The user edits settings while a browser sign-in started from `snapshot`
  // is still open.
  await store.setFreeOnly('workbuddy-cn', 'acct-1', false)
  await store.setProxy('workbuddy-cn', 'acct-1', 'http://127.0.0.1:7890')
  await store.setHiddenModels('workbuddy-cn', 'acct-1', ['paid-model'])
  await store.setEnabled('workbuddy-cn', 'acct-1', false)
  await store.setPriorities('workbuddy-cn', ['acct-1'])

  // The sign-in completes minutes later with the old snapshot but new auth.
  const merged = await store.save({
    ...snapshot,
    auth: { type: 'oauth', access: 'fresh-token', accountId: 'user-acct-1' },
  })

  assert.equal(merged.auth.access, 'fresh-token')
  assert.equal(merged.freeOnly, false)
  assert.equal(merged.proxy, 'http://127.0.0.1:7890')
  assert.deepEqual(merged.hiddenModels, ['paid-model'])
  assert.equal(merged.enabled, false)
  assert.equal(merged.priority, 0)
  assert.equal(merged.createdAt, snapshot.createdAt)

  const stored = await store.get('workbuddy-cn', 'acct-1')
  assert.equal(stored.freeOnly, false)
  assert.equal(stored.proxy, 'http://127.0.0.1:7890')
  assert.equal(stored.auth.access, 'fresh-token')
})

test('save clears settings the user removed during the sign-in window', async () => {
  const store = new AccountStore(fakeCredentials())
  const snapshot = await store.save(
    account('acct-1', { proxy: 'http://127.0.0.1:7890', hiddenModels: ['paid-model'] }),
  )
  await store.setProxy('workbuddy-cn', 'acct-1', '')
  await store.setHiddenModels('workbuddy-cn', 'acct-1', [])

  const merged = await store.save({ ...snapshot, auth: { type: 'oauth', access: 'fresh' } })
  assert.equal(merged.proxy, undefined)
  // An empty hidden list is stored as an empty array, not resurrected.
  assert.deepEqual(merged.hiddenModels, [])
})

test('save still creates a brand-new account from the payload', async () => {
  const store = new AccountStore(fakeCredentials())
  const created = await store.save(
    account('acct-9', { freeOnly: false, proxy: 'http://127.0.0.1:1080', enabled: true }),
  )
  assert.equal(created.freeOnly, false)
  assert.equal(created.proxy, 'http://127.0.0.1:1080')
  assert.equal(created.enabled, true)
})

test('updateAuth refuses garbage from a channel package', async () => {
  const store = new AccountStore(fakeCredentials())
  await store.save(account('acct-1'))
  const before = await store.get('workbuddy-cn', 'acct-1')

  for (const garbage of [null, 'token', 42, [], { type: 'bogus' }, { type: 'api', key: '' }]) {
    await store.updateAuth('workbuddy-cn', 'acct-1', garbage)
    const after = await store.get('workbuddy-cn', 'acct-1')
    assert.deepEqual(after.auth, before.auth)
  }

  await store.updateAuth('workbuddy-cn', 'acct-1', {
    type: 'success',
    refresh: 'r2',
    access: 'a2',
  })
  const refreshed = await store.get('workbuddy-cn', 'acct-1')
  assert.equal(refreshed.auth.type, 'oauth')
  assert.equal(refreshed.auth.access, 'a2')
  // Settings survive an auth refresh.
  assert.equal(refreshed.freeOnly, before.freeOnly)
})

test('read and delete paths ignore malformed account ids', async () => {
  const credentials = fakeCredentials()
  const store = new AccountStore(credentials)
  await store.save(account('acct-1'))

  assert.equal(await store.get('workbuddy-cn', '../x'), undefined)
  await store.delete('workbuddy-cn', '../x')
  await store.updateAuth('workbuddy-cn', '../x', { type: 'oauth', access: 'evil' })
  await store.setFreeOnly('workbuddy-cn', '../x', false)

  assert.deepEqual([...credentials.records.keys()], ['dsh-hitchfin/workbuddy-cn-acct-1'])
  assert.equal((await store.get('workbuddy-cn', 'acct-1')).freeOnly, true)
})
