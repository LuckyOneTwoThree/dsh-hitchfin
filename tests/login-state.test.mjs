import './_fresh.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHitchfinRoutes } from '../lib/routes.js'

const PREFIX = '/dsh-hitchfin'

const descriptor = {
  id: 'workbuddy-cn',
  providerId: 'hitchfin-workbuddy-cn',
  displayName: 'WorkBuddy CN',
  packageName: 'mock',
  authMethods: [
    { id: 'browser', label: 'Browser', kind: 'browser', index: 0 },
    { id: 'api-key', label: 'Key', kind: 'api-key', index: 2 },
  ],
  freeOnlyDefault: true,
}

function makeReq(method, path, body, extraHeaders = {}) {
  const raw = typeof body === 'string' ? body : body === undefined ? '' : JSON.stringify(body)
  return {
    method,
    url: path,
    headers: {
      origin: 'http://127.0.0.1',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...extraHeaders,
    },
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() {
      if (raw) yield Buffer.from(raw)
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

function harness(existingAccounts = [], routeOptions = {}) {
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
    get(name) {
      return name === 'connection' ? routeOptions.connection : undefined
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
      apiKey: async (_channel, _accountId, _method, key) => ({
        auth:
          routeOptions.apiKeyAuth !== undefined
            ? { ...routeOptions.apiKeyAuth, ...(key ? { key } : {}) }
            : {},
      }),
      models: async () => [],
      usage: async () => ({}),
    },
    adapter: { invalidate() {}, forget() {} },
  }
  const cleanup = registerHitchfinRoutes(ctx, services, routeOptions)
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

test('login routes reject account ids that are not credential-key safe', async () => {
  const { handler, cleanup } = harness()
  try {
    const started = await invoke(handler, 'POST', `${PREFIX}/login/start`, {
      channelId: descriptor.id,
      method: 0,
      accountId: 'BAD_ID',
    })
    assert.equal(started.status, 400)
    assert.match(started.json.error, /accountId/)

    const keyed = await invoke(handler, 'POST', `${PREFIX}/login/apikey`, {
      channelId: descriptor.id,
      method: 2,
      accountId: 'a/b',
      key: 'sk-test',
    })
    assert.equal(keyed.status, 400)
    assert.match(keyed.json.error, /accountId/)
  } finally {
    cleanup()
  }
})

test('login start refuses a method the product did not expose', async () => {
  const { handler, cleanup, saved } = harness()
  try {
    const hidden = await invoke(handler, 'POST', `${PREFIX}/login/start`, {
      channelId: descriptor.id,
      method: 1,
      accountId: 'acct-1',
    })
    assert.equal(hidden.status, 400)
    assert.match(hidden.json.error, /unknown sign-in method/)

    const apiKeyViaStart = await invoke(handler, 'POST', `${PREFIX}/login/start`, {
      channelId: descriptor.id,
      method: 2,
      accountId: 'acct-1',
    })
    assert.equal(apiKeyViaStart.status, 400)
    assert.equal(saved.length, 0)
  } finally {
    cleanup()
  }
})

test('an expired login cancels its worker session and never saves a late account', async () => {
  const { handler, release, saved, cleanup, getCancelCount } = harness([], {
    loginTtlMs: 15,
  })
  try {
    const started = await invoke(handler, 'POST', `${PREFIX}/login/start`, {
      channelId: descriptor.id,
      method: 0,
      accountId: 'acct-1',
    })
    assert.equal(started.status, 200)
    await new Promise((resolve) => setTimeout(resolve, 40))
    assert.equal(getCancelCount(), 1)

    release()
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(saved.length, 0)
  } finally {
    cleanup()
  }
})

test('re-adding the same API key reuses the existing account instead of duplicating it', async () => {
  const key = 'sk-same-key-for-dedupe'
  const { handler, saved, cleanup } = harness(
    [
      {
        channelId: descriptor.id,
        accountId: 'acct-1',
        label: 'WorkBuddy CN',
        auth: { type: 'api', key },
        freeOnly: true,
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    { apiKeyAuth: { type: 'api', key } },
  )
  try {
    const first = await invoke(handler, 'POST', `${PREFIX}/login/apikey`, {
      channelId: descriptor.id,
      method: 2,
      accountId: 'new',
      key,
    })
    assert.equal(first.status, 200)
    assert.equal(first.json.account.accountId, 'acct-1')
    assert.equal(saved.length, 1)
    assert.equal(saved[0].accountId, 'acct-1')

    // A different key is a different account, so it gets a fresh id.
    const second = await invoke(handler, 'POST', `${PREFIX}/login/apikey`, {
      channelId: descriptor.id,
      method: 2,
      accountId: 'new',
      key: 'sk-another-key',
    })
    assert.equal(second.status, 200)
    assert.equal(second.json.account.accountId, 'acct-2')
  } finally {
    cleanup()
  }
})

test('the fallback fence rejects a non-loopback Host header', async () => {
  const { handler, cleanup } = harness()
  try {
    const req = makeReq('GET', `${PREFIX}/state`)
    req.headers.host = 'evil.example'
    const res = makeRes()
    handler(req, res)
    for (let i = 0; i < 50 && !res.body; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    assert.equal(res.statusCode, 403)
    assert.match(res.body, /host refused/)
  } finally {
    cleanup()
  }
})

test('a connection service without requestRejection still gets the Host fence', async () => {
  const { handler, cleanup } = harness([], { connection: {} })
  try {
    const req = makeReq('GET', `${PREFIX}/state`)
    req.headers.host = 'evil.example'
    const res = makeRes()
    handler(req, res)
    for (let i = 0; i < 50 && !res.body; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    assert.equal(res.statusCode, 403)
    assert.match(res.body, /host refused/)
  } finally {
    cleanup()
  }
})

test('a host-owned requestRejection fence still refuses a request', async () => {
  const { handler, cleanup } = harness([], {
    connection: { requestRejection: () => 403 },
  })
  try {
    const res = makeRes()
    handler(makeReq('GET', `${PREFIX}/state`), res)
    for (let i = 0; i < 50 && !res.body; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    assert.equal(res.statusCode, 403)
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

test('a non-boolean free-only flag is rejected instead of read as true', async () => {
  const existing = [
    { accountId: 'acct-1', channelId: 'workbuddy-cn', auth: { type: 'oauth', access: 'token' } },
  ]
  const { handler, cleanup } = harness(existing)
  try {
    const result = await invoke(handler, 'POST', `${PREFIX}/free-only`, {
      channelId: 'workbuddy-cn',
      accountId: 'acct-1',
      freeOnly: 'false',
    })
    assert.equal(result.status, 400)
    assert.match(result.json.error, /boolean/)
  } finally {
    cleanup()
  }
})

test('a settings write for an unknown account returns 404', async () => {
  const { handler, cleanup } = harness([])
  try {
    const result = await invoke(handler, 'POST', `${PREFIX}/account/enabled`, {
      channelId: 'workbuddy-cn',
      accountId: 'ghost',
      enabled: false,
    })
    assert.equal(result.status, 404)
  } finally {
    cleanup()
  }
})

test('hiding models for an unknown account returns 404 instead of a silent no-op', async () => {
  const { handler, cleanup } = harness([])
  try {
    const result = await invoke(handler, 'POST', `${PREFIX}/models/hidden`, {
      channelId: 'workbuddy-cn',
      accountId: 'ghost',
      hiddenModels: ['some-model'],
    })
    assert.equal(result.status, 404)
    assert.match(result.json.error, /unknown account/)
  } finally {
    cleanup()
  }
})

test('a text/plain body is refused before it reaches a settings handler', async () => {
  const { handler, cleanup } = harness([])
  try {
    const req = makeReq('POST', `${PREFIX}/free-only`, { channelId: 'workbuddy-cn' })
    req.headers['content-type'] = 'text/plain;charset=UTF-8'
    const res = makeRes()
    handler(req, res)
    for (let i = 0; i < 50 && !res.body; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    assert.equal(res.statusCode, 400)
  } finally {
    cleanup()
  }
})

test('CSRF fence refuses Origin: null and non-JSON simple-request writes', async () => {
  const existing = [
    { accountId: 'acct-1', channelId: 'workbuddy-cn', auth: { type: 'oauth', access: 'token' } },
  ]
  let deleted = false
  let handler
  const cleanup = registerHitchfinRoutes(
    {
      webServer: {
        register(route) {
          handler = route.handler
          return () => {}
        },
      },
      logger: { info() {}, warn() {} },
      emit() {},
      get: () => undefined,
    },
    {
      registry: { all: () => [descriptor], loadInfo: () => undefined },
      accounts: {
        get: async (_c, id) => existing.find((e) => e.accountId === id),
        list: async () => existing,
        nextAccountId: async () => 'acct-2',
        save: async (p) => p,
        delete: async () => {
          deleted = true
        },
      },
      worker: {},
      adapter: { invalidate() {}, forget() {} },
    },
  )
  const send = async (req) => {
    const res = makeRes()
    handler(req, res)
    for (let i = 0; i < 50 && !res.body; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    return { status: res.statusCode, json: JSON.parse(res.body || '{}') }
  }
  try {
    const nullOrigin = await send(
      makeReq('POST', `${PREFIX}/delete`, { channelId: 'workbuddy-cn', accountId: 'acct-1' }, {
        origin: 'null',
        host: '127.0.0.1:3000',
        'content-type': 'application/x-www-form-urlencoded',
      }),
    )
    assert.equal(nullOrigin.status, 403)

    const formContentType = await send(
      makeReq('POST', `${PREFIX}/delete`, { channelId: 'workbuddy-cn', accountId: 'acct-1' }, {
        'content-type': 'application/x-www-form-urlencoded',
      }),
    )
    assert.equal(formContentType.status, 400)

    const missingType = await send(
      makeReq('POST', `${PREFIX}/free-only`, '{"channelId":"workbuddy-cn"}', {
        'content-type': undefined,
      }),
    )
    assert.equal(missingType.status, 400)

    const badJson = await send(makeReq('POST', `${PREFIX}/free-only`, '{not-json'))
    assert.equal(badJson.status, 400)
    assert.match(badJson.json.error, /invalid JSON/)

    const badHidden = await invoke(handler, 'POST', `${PREFIX}/models/hidden`, {
      channelId: 'workbuddy-cn',
    })
    assert.equal(badHidden.status, 400)
    assert.match(badHidden.json.error, /array/)

    assert.equal(deleted, false)
  } finally {
    cleanup()
  }
})

test('plugin cleanup cancels in-flight logins so a late callback never saves', async () => {
  let emitted = 0
  let handler
  let release
  let cancelCount = 0
  const saved = []
  const callbackGate = new Promise((resolve) => {
    release = resolve
  })
  const cleanup = registerHitchfinRoutes(
    {
      webServer: {
        register(route) {
          handler = route.handler
          return () => {}
        },
      },
      logger: { info() {}, warn() {} },
      emit() {
        emitted += 1
      },
      get: () => undefined,
    },
    {
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
        get: async () => undefined,
        list: async () => [],
        nextAccountId: async () => 'acct-1',
        save: async (payload) => {
          saved.push(payload)
          return payload
        },
      },
      worker: {
        authorize: async () => ({ session: 'session-late', method: 'auto' }),
        callback: () => callbackGate.then(() => ({ auth: { type: 'oauth', access: 'token' } })),
        cancelAuth() {
          cancelCount += 1
        },
      },
      adapter: { invalidate() {}, forget() {} },
    },
  )
  const started = await invoke(handler, 'POST', `${PREFIX}/login/start`, {
    channelId: descriptor.id,
    method: 0,
    accountId: 'new',
  })
  assert.equal(started.status, 200)
  cleanup()
  assert.equal(cancelCount, 1)
  release()
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(saved.length, 0)
  assert.equal(emitted, 0)
})

test('concurrent new-account logins reserve distinct accountIds', async () => {
  const existing = []
  let seq = 0
  let handler
  const resolvers = []
  const cleanup = registerHitchfinRoutes(
    {
      webServer: {
        register(route) {
          handler = route.handler
          return () => {}
        },
      },
      logger: { info() {}, warn() {} },
      emit() {},
      get: () => undefined,
    },
    {
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
        get: async () => undefined,
        list: async () => existing,
        nextAccountId: async () => {
          await new Promise((resolve) => setTimeout(resolve, 10))
          return `acct-${existing.length + 1}`
        },
        save: async (payload) => {
          existing.push(payload)
          return payload
        },
      },
      worker: {
        authorize: async (_loadInfo, accountId) => {
          seq += 1
          return { session: `s-${seq}:${accountId}`, method: 'auto' }
        },
        callback: () =>
          new Promise((resolve) => {
            resolvers.push(() => resolve({ auth: { type: 'oauth', access: `tok-${resolvers.length}` } }))
          }),
        cancelAuth() {},
      },
      adapter: { invalidate() {}, forget() {} },
    },
  )
  try {
    const [a, b] = await Promise.all([
      invoke(handler, 'POST', `${PREFIX}/login/start`, {
        channelId: descriptor.id,
        method: 0,
        accountId: 'new',
      }),
      invoke(handler, 'POST', `${PREFIX}/login/start`, {
        channelId: descriptor.id,
        method: 0,
        accountId: 'new',
      }),
    ])
    assert.equal(a.status, 200)
    assert.equal(b.status, 200)
    assert.notEqual(a.json.login.accountId, b.json.login.accountId)
    assert.deepEqual([a.json.login.accountId, b.json.login.accountId].sort(), ['acct-1', 'acct-2'])
  } finally {
    for (const r of resolvers) r()
    cleanup()
  }
})
