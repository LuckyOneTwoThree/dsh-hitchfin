import test from 'node:test'
import assert from 'node:assert/strict'
import { AccountStore, isValidAccountId, labelFromAuth } from '../lib/accounts/store.js'

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
  assert.equal(labelFromAuth('WorkBuddy CN', { accountId: 'short' }), 'WorkBuddy CN · short')
  assert.equal(labelFromAuth('WorkBuddy CN', {}), 'WorkBuddy CN')
  assert.equal(labelFromAuth('WorkBuddy CN', undefined), 'WorkBuddy CN')
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
