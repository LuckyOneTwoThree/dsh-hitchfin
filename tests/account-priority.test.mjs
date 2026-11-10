import test from 'node:test'
import assert from 'node:assert/strict'
import { AccountStore, sortAccountsByPriority } from '../lib/accounts/store.js'
import { HitchfinAdapter } from '../lib/adapter/hitchfin-adapter.js'
import { registerHitchfinRoutes } from '../lib/routes.js'

const descriptor = {
  id: 'workbuddy-cn',
  providerId: 'hitchfin-workbuddy-cn',
  packageProvider: 'workbuddy',
  displayName: 'WorkBuddy CN',
  status: 'stable',
  protocols: ['openai-completions'],
  authMethods: [],
  freeOnlyDefault: false,
  supportsFreeWindow: true,
  packageName: 'mock',
  packageVersion: '0.0.0',
  exportName: 'Mock',
  fallbackPath: '/tmp/mock.mjs',
}

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
    channelId: descriptor.id,
    accountId,
    label: `Account ${accountId}`,
    auth: { type: 'oauth', access: `token-${accountId}` },
    freeOnly: false,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

function model(id = 'glm-5.3') {
  return { id, name: id, free: false, freeKnown: false, input: ['text'], efforts: [] }
}

function sseResponse(text = 'ok') {
  return new Response(
    new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder()
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              choices: [{ delta: { content: text }, finish_reason: 'stop' }],
            })}\n\n`,
          ),
        )
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  )
}

function makeHarness(accounts, options = {}) {
  const credentials = fakeCredentials()
  for (const entry of accounts) {
    credentials.records.set(`dsh-hitchfin/${descriptor.id}-${entry.accountId}`, {
      kind: 'grant',
      payload: entry,
    })
  }
  const store = new AccountStore(credentials)
  const calls = []
  const worker = {
    models: async () => [model()],
    usage: async () => ({}),
    fetch: async (url, init, call) => {
      calls.push(call.accountId)
      return options.responseFor
        ? options.responseFor(call.accountId)
        : sseResponse()
    },
    authorize: async () => ({ session: 's', method: 'auto' }),
    callback: async () => ({ auth: {} }),
    apiKey: async () => ({ auth: {} }),
    cancelAuth() {},
  }
  const registry = {
    all: () => [descriptor],
    get: (provider) => (provider === descriptor.providerId ? descriptor : undefined),
    loadInfo: () => ({
      channelId: descriptor.id,
      packagePath: '/tmp/mock.mjs',
      exportName: 'Mock',
      provider: 'workbuddy',
    }),
    providerIds: () => [descriptor.providerId],
  }
  const adapter = new HitchfinAdapter({
    registry,
    accounts: store,
    worker,
    logger: { info() {}, warn() {}, error() {} },
  })
  let handler
  const ctx = {
    webServer: {
      register(route) {
        handler = route.handler
        return () => {}
      },
    },
    logger: { info() {}, warn() {} },
    emit() {},
    get: () => undefined,
  }
  const cleanup = registerHitchfinRoutes(ctx, { registry, accounts: store, worker, adapter })
  return { store, adapter, calls, handler, cleanup }
}

function makeReq(method, path, body) {
  const payload = body === undefined ? '' : JSON.stringify(body)
  return {
    method,
    url: path,
    headers: { origin: 'http://127.0.0.1' },
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() {
      if (payload) yield Buffer.from(payload)
    },
  }
}

function makeRes() {
  return {
    headersSent: false,
    statusCode: 200,
    body: '',
    writeHead(status) {
      this.statusCode = status
      return this
    },
    end(text) {
      this.body = text
      return this
    },
    destroy() {},
  }
}

async function invoke(handler, method, path, body) {
  const res = makeRes()
  handler(makeReq(method, path, body), res)
  for (let i = 0; i < 100 && !res.body; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  return { status: res.statusCode, json: JSON.parse(res.body || '{}') }
}

async function collect(iterable) {
  const chunks = []
  for await (const chunk of iterable) chunks.push(chunk)
  return chunks
}

const generateOptions = {
  provider: descriptor.providerId,
  model: 'glm-5.3',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
  sessionId: 'session-1',
}

// ---------------------------------------------------------------------------
// Ordering and persistence

test('explicit priority wins, missing priority falls back to id order', () => {
  const ordered = sortAccountsByPriority([
    { accountId: 'acct-9', priority: 0 },
    { accountId: 'acct-1' },
    { accountId: 'acct-3', priority: 2 },
    { accountId: 'acct-2', priority: 1 },
  ])
  assert.deepEqual(
    ordered.map((a) => a.accountId),
    ['acct-9', 'acct-2', 'acct-3', 'acct-1'],
  )
})

test('enabled and priority are persisted and parsed back', async () => {
  const credentials = fakeCredentials()
  credentials.records.set(`dsh-hitchfin/${descriptor.id}-acct-1`, {
    kind: 'grant',
    payload: account('acct-1'),
  })
  const store = new AccountStore(credentials)
  await store.setEnabled(descriptor.id, 'acct-1', false)
  await store.setPriorities(descriptor.id, ['acct-1'])
  const stored = await store.get(descriptor.id, 'acct-1')
  assert.equal(stored.enabled, false)
  assert.equal(stored.priority, 0)
  assert.equal((await store.list(descriptor.id))[0].auth.type, 'oauth')
})

// ---------------------------------------------------------------------------
// Routing

test('disabled accounts are skipped and their data is kept', async () => {
  const { store, adapter, calls, cleanup } = makeHarness([
    account('acct-1', { priority: 0, enabled: false }),
    account('acct-2', { priority: 1 }),
  ])
  try {
    await collect(adapter.stream(generateOptions))
    assert.deepEqual(calls, ['acct-2'])
    const stored = await store.get(descriptor.id, 'acct-1')
    assert.equal(stored.enabled, false)
    assert.equal(stored.auth.access, 'token-acct-1')
  } finally {
    cleanup()
  }
})

test('priority defines the failover order', async () => {
  const { adapter, calls, cleanup } = makeHarness(
    [
      account('acct-2', { priority: 1 }),
      account('acct-1', { priority: 0 }),
    ],
    { responseFor: (id) => (id === 'acct-1' ? new Response('{}', { status: 500 }) : sseResponse()) },
  )
  try {
    await collect(adapter.stream(generateOptions))
    assert.deepEqual(calls, ['acct-1', 'acct-2'])
  } finally {
    cleanup()
  }
})

test('all accounts disabled gives an actionable message', async () => {
  const { adapter, calls, cleanup } = makeHarness([
    account('acct-1', { enabled: false }),
  ])
  try {
    const chunks = await collect(adapter.stream(generateOptions))
    assert.equal(calls.length, 0)
    assert.match(chunks.at(-1).reason.failure.message, /enable one in Settings/)
  } finally {
    cleanup()
  }
})

// ---------------------------------------------------------------------------
// Settings endpoints

test('/state returns ordered accounts with primary, enabled and no aggregate quota', async () => {
  const { handler, cleanup } = makeHarness([
    account('acct-2', { priority: 1 }),
    account('acct-1', { priority: 0, enabled: false }),
    account('acct-3', { priority: 2 }),
  ])
  try {
    const { json } = await invoke(handler, 'GET', '/dsh-hitchfin/state?quota=0')
    const channel = json.channels[0]
    assert.deepEqual(
      channel.accounts.map((a) => a.accountId),
      ['acct-1', 'acct-2', 'acct-3'],
    )
    assert.equal(channel.accounts[0].enabled, false)
    assert.equal(channel.accounts[0].isPrimary, false)
    assert.equal(channel.accounts[1].isPrimary, true)
    assert.equal(channel.quota, null)
  } finally {
    cleanup()
  }
})

test('/account/enabled flips the stored flag', async () => {
  const { store, handler, cleanup } = makeHarness([account('acct-1')])
  try {
    const off = await invoke(handler, 'POST', '/dsh-hitchfin/account/enabled', {
      channelId: descriptor.id,
      accountId: 'acct-1',
      enabled: false,
    })
    assert.equal(off.status, 200)
    assert.equal((await store.get(descriptor.id, 'acct-1')).enabled, false)
    await invoke(handler, 'POST', '/dsh-hitchfin/account/enabled', {
      channelId: descriptor.id,
      accountId: 'acct-1',
      enabled: true,
    })
    assert.equal((await store.get(descriptor.id, 'acct-1')).enabled, true)
  } finally {
    cleanup()
  }
})

test('/account/order persists the visible order as priorities', async () => {
  const { store, handler, cleanup } = makeHarness([
    account('acct-1'),
    account('acct-2'),
  ])
  try {
    const { status } = await invoke(handler, 'POST', '/dsh-hitchfin/account/order', {
      channelId: descriptor.id,
      accountIds: ['acct-2', 'acct-1'],
    })
    assert.equal(status, 200)
    assert.equal((await store.get(descriptor.id, 'acct-2')).priority, 0)
    assert.equal((await store.get(descriptor.id, 'acct-1')).priority, 1)
  } finally {
    cleanup()
  }
})
