import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHitchfinRoutes } from '../lib/routes.js'

const PREFIX = '/dsh-hitchfin'

const descriptor = {
  id: 'workbuddy-cn',
  providerId: 'hitchfin-workbuddy-cn',
  displayName: 'WorkBuddy CN',
  packageName: 'mock',
  authMethods: [{ id: 'browser', label: 'Browser', kind: 'browser', index: 0 }],
  freeOnlyDefault: true,
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

function harness(existingAccounts = []) {
  let handler
  let release
  let cancelCount = 0
  const saved = []
  const callbackGate = new Promise((resolve) => {
    release = resolve
  })
  const ctx = {
    webServer: {
      register(route) {
        handler = route.handler
        return () => {}
      },
    },
    logger: { info() {}, warn() {} },
    emit() {},
    get() {
      return undefined
    },
  }
  const services = {
    registry: {
      all: () => [descriptor],
      loadInfo: () => ({
        channelId: descriptor.id,
        packagePath: '/tmp/mock.mjs',
        exportName: 'Mock',
        provider: 'workbuddy',
      }),
    },
    accounts: {
      get: async (_channelId, accountId) =>
        existingAccounts.find((entry) => entry.accountId === accountId),
      list: async () => existingAccounts,
      nextAccountId: async () => `acct-${existingAccounts.length + 1}`,
      save: async (payload) => {
        saved.push(payload)
        return payload
      },
    },
    worker: {
      authorize: async () => ({ session: 'session-1', method: 'auto' }),
      callback: () => callbackGate.then(() => ({ auth: { type: 'oauth', access: 'token' } })),
      cancelAuth() {
        cancelCount += 1
      },
      apiKey: async () => ({ auth: {} }),
      models: async () => [],
      usage: async () => ({}),
    },
    adapter: { invalidate() {}, forget() {} },
  }
  const cleanup = registerHitchfinRoutes(ctx, services)
  return {
    handler,
    release,
    saved,
    cleanup,
    getCancelCount: () => cancelCount,
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

async function waitFor(predicate, timeoutMs = 1000) {
  const started = Date.now()
  while (!predicate() && Date.now() - started < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

test('a cancelled login does not save an account when the callback resolves late', async () => {
  const { handler, release, saved, cleanup } = harness()
  try {
    const started = await invoke(handler, 'POST', `${PREFIX}/login/start`, {
      channelId: descriptor.id,
      method: 0,
      accountId: 'acct-1',
    })
    assert.equal(started.status, 200)
    const id = started.json.login.id
    assert.ok(id)

    const cancelled = await invoke(handler, 'POST', `${PREFIX}/login/cancel`, { id })
    assert.equal(cancelled.json.login.status, 'cancelled')

    release()
    await waitFor(() => true)
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(saved.length, 0)
  } finally {
    cleanup()
  }
})

test('a login that is not cancelled still saves its account', async () => {
  const { handler, release, saved, cleanup } = harness()
  try {
    await invoke(handler, 'POST', `${PREFIX}/login/start`, {
      channelId: descriptor.id,
      method: 0,
      accountId: 'acct-1',
    })
    release()
    await waitFor(() => saved.length > 0)
    assert.equal(saved.length, 1)
    assert.equal(saved[0].accountId, 'acct-1')
  } finally {
    cleanup()
  }
})

test('a login preserves its proxy and inherits channel freeOnly and hiddenModels on a new account', async () => {
  const { handler, release, saved, cleanup } = harness([
    {
      channelId: descriptor.id,
      accountId: 'acct-1',
      label: 'acct-1',
      auth: { type: 'oauth', access: 'token-1' },
      freeOnly: false,
      hiddenModels: ['glm-5.3', 'kimi-k3-1'],
      createdAt: 1,
      updatedAt: 1,
    },
  ])
  try {
    await invoke(handler, 'POST', `${PREFIX}/login/start`, {
      channelId: descriptor.id,
      method: 0,
      accountId: 'new',
      proxy: 'http://127.0.0.1:7890',
    })
    release()
    await waitFor(() => saved.length > 0)
    assert.equal(saved.length, 1)
    assert.equal(saved[0].accountId, 'acct-2')
    assert.equal(saved[0].proxy, 'http://127.0.0.1:7890/')
    assert.equal(saved[0].freeOnly, false)
    assert.deepEqual(saved[0].hiddenModels, ['glm-5.3', 'kimi-k3-1'])
  } finally {
    cleanup()
  }
})

test('cancelling an already completed login does not overwrite ok status or recycle the worker', async () => {
  const { handler, release, saved, cleanup, getCancelCount } = harness()
  try {
    const started = await invoke(handler, 'POST', `${PREFIX}/login/start`, {
      channelId: descriptor.id,
      method: 0,
      accountId: 'acct-1',
    })
    const id = started.json.login.id
    release()
    await waitFor(() => saved.length > 0)

    const cancelled = await invoke(handler, 'POST', `${PREFIX}/login/cancel`, { id })
    assert.equal(cancelled.status, 200)
    assert.equal(cancelled.json.login.status, 'ok')
    assert.equal(getCancelCount(), 0)
  } finally {
    cleanup()
  }
})

test('malformed Origin header is rejected by fenceRefused', async () => {
  const { handler, cleanup } = harness()
  try {
    const req = makeReq('GET', `${PREFIX}/state`)
    req.headers.origin = 'not a valid url://'
    const res = makeRes()
    handler(req, res)
    for (let i = 0; i < 50 && !res.body; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    assert.equal(res.statusCode, 403)
  } finally {
    cleanup()
  }
})
