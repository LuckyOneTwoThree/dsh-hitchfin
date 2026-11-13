import './_fresh.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHitchfinRoutes } from '../lib/routes.js'

const PREFIX = '/dsh-hitchfin'
const descriptor = {
  id: 'workbuddy-cn',
  providerId: 'hitchfin-workbuddy-cn',
  displayName: 'WorkBuddy CN',
  status: 'stable',
  authMethods: [],
  freeOnlyDefault: true,
  supportsFreeWindow: true,
}
const loadInfo = {
  channelId: descriptor.id,
  packagePath: '/tmp/mock.mjs',
  exportName: 'Mock',
  provider: 'workbuddy',
}
const account = {
  channelId: descriptor.id,
  accountId: 'acct-1',
  label: 'mock',
  auth: { type: 'oauth', access: 'token' },
  freeOnly: true,
  hiddenModels: [],
  enabled: true,
  createdAt: 0,
  updatedAt: 0,
}
const model = {
  id: 'live-a',
  name: 'Live A',
  input: ['text'],
  efforts: [],
  free: true,
  freeKnown: true,
}

function makeReq(method, path, body) {
  const payload = body === undefined ? '' : JSON.stringify(body)
  return {
    method,
    url: path,
    headers: {
      'content-type': 'application/json',
      origin: 'http://127.0.0.1',
    },
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

function harness() {
  let handler
  const counts = { listings: 0, quotas: 0 }
  let current = { ...account }
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
  const services = {
    registry: {
      all: () => [descriptor],
      loadInfo: () => loadInfo,
      packageInfo: () => undefined,
      get: () => descriptor,
      providerIds: () => [descriptor.providerId],
    },
    accounts: {
      list: async () => [current],
      get: async () => current,
      setChannelFreeOnly: async (_channelId, freeOnly) => {
        current = { ...current, freeOnly, updatedAt: current.updatedAt + 1 }
      },
      setFreeOnly: async () => {},
      setHiddenModels: async () => {},
      setChannelHiddenModels: async () => {},
    },
    worker: {
      listModels: async () => {
        counts.listings += 1
        return { models: [model], liveFailed: false }
      },
      usage: async () => {
        counts.quotas += 1
        return { windows: [] }
      },
    },
    adapter: {
      invalidate() {},
      forget() {},
      listModels: async () => [],
      accountStatus: () => ({}),
      cachedModels: () => [],
    },
  }
  const cleanup = registerHitchfinRoutes(ctx, services)
  const request = async (method, path, body) => {
    const res = makeRes()
    handler(makeReq(method, path, body), res)
    for (let i = 0; i < 100 && !res.body; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    return { status: res.statusCode, body: JSON.parse(res.body || '{}') }
  }
  return { request, counts, cleanup, setAccount: (next) => (current = { ...current, ...next }) }
}

test('the quota=0 / quota=1 refresh pair reads the vendor once', async () => {
  const h = harness()
  try {
    const first = await h.request('GET', `${PREFIX}/state?quota=0`)
    assert.equal(first.status, 200)
    assert.equal(first.body.channels[0].accounts[0].quota, undefined)
    const second = await h.request('GET', `${PREFIX}/state`)
    assert.equal(second.status, 200)
    assert.deepEqual(second.body.channels[0].accounts[0].quota, { windows: [] })
    assert.equal(h.counts.listings, 1)
    assert.equal(h.counts.quotas, 1)
  } finally {
    h.cleanup()
  }
})

test('concurrent /state requests share one in-flight listing and quota read', async () => {
  const h = harness()
  try {
    const [a, b, c] = await Promise.all([
      h.request('GET', `${PREFIX}/state`),
      h.request('GET', `${PREFIX}/state?quota=0`),
      h.request('GET', `${PREFIX}/state`),
    ])
    assert.equal(a.status, 200)
    assert.equal(b.status, 200)
    assert.equal(c.status, 200)
    assert.equal(h.counts.listings, 1)
    assert.equal(h.counts.quotas, 1)
  } finally {
    h.cleanup()
  }
})

test('a settings write invalidates the cached snapshot', async () => {
  const h = harness()
  try {
    await h.request('GET', `${PREFIX}/state`)
    assert.equal(h.counts.listings, 1)
    const write = await h.request('POST', `${PREFIX}/free-only`, {
      channelId: descriptor.id,
      freeOnly: false,
    })
    assert.equal(write.status, 200)
    await h.request('GET', `${PREFIX}/state`)
    assert.equal(h.counts.listings, 2)
  } finally {
    h.cleanup()
  }
})

test('a changed account signature invalidates the cached snapshot', async () => {
  const h = harness()
  try {
    await h.request('GET', `${PREFIX}/state`)
    assert.equal(h.counts.listings, 1)
    h.setAccount({ proxy: 'http://127.0.0.1:7890', updatedAt: 1 })
    await h.request('GET', `${PREFIX}/state`)
    assert.equal(h.counts.listings, 2)
  } finally {
    h.cleanup()
  }
})

test('concurrent /state does not reuse an in-flight snapshot with an older signature', async () => {
  let handler
  let current = { ...account }
  let releaseFirst
  let callIndex = 0
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve
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
      emit() {},
      get: () => undefined,
    },
    {
      registry: { all: () => [descriptor], loadInfo: () => loadInfo },
      accounts: {
        get: async () => current,
        list: async () => [current],
        nextAccountId: async () => 'acct-2',
        save: async (next) => {
          current = next
          return next
        },
      },
      worker: {
        listModels: async () => {
          callIndex += 1
          const id = callIndex
          if (id === 1) {
            await firstGate
            return { models: [{ ...model, id: 'old-model', name: 'Old Model' }], liveFailed: false }
          }
          return { models: [{ ...model, id: 'new-model', name: 'New Model' }], liveFailed: false }
        },
        usage: async () => ({ windows: [] }),
      },
      adapter: {
        invalidate() {},
        forget() {},
        listModels: async () => [],
        accountStatus: () => ({}),
        cachedModels: () => [],
      },
    },
  )
  const getState = () =>
    new Promise((resolve) => {
      const res = makeRes()
      handler(makeReq('GET', `${PREFIX}/state?quota=0`), res)
      const poll = () => {
        if (res.body) resolve({ status: res.statusCode, body: JSON.parse(res.body) })
        else setTimeout(poll, 5)
      }
      poll()
    })
  try {
    const firstPromise = getState()
    await new Promise((resolve) => setTimeout(resolve, 15))
    current = { ...current, proxy: 'http://127.0.0.1:7890', updatedAt: 42 }
    const second = await getState()
    assert.deepEqual(
      second.body.channels[0].models.map((m) => m.id),
      ['new-model'],
    )
    releaseFirst()
    const first = await firstPromise
    assert.deepEqual(
      first.body.channels[0].models.map((m) => m.id),
      ['old-model'],
    )
    const third = await getState()
    assert.deepEqual(
      third.body.channels[0].models.map((m) => m.id),
      ['new-model'],
    )
    assert.equal(callIndex, 2)
  } finally {
    releaseFirst()
    cleanup()
  }
})

test('invalidating a channel prevents a stale in-flight /state from poisoning cache', async () => {
  let handler
  let releaseFirst
  let callIndex = 0
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve
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
      emit() {},
      get: () => undefined,
    },
    {
      registry: { all: () => [descriptor], loadInfo: () => loadInfo },
      accounts: {
        get: async () => account,
        list: async () => [account],
        nextAccountId: async () => 'acct-2',
        save: async (next) => next,
      },
      worker: {
        reloadChannel: async () => {},
        listModels: async () => {
          callIndex += 1
          if (callIndex === 1) {
            await firstGate
            return { models: [{ ...model, id: 'stale-model', name: 'Stale Model' }], liveFailed: false }
          }
          return { models: [{ ...model, id: 'fresh-model', name: 'Fresh Model' }], liveFailed: false }
        },
        usage: async () => ({ windows: [] }),
      },
      adapter: {
        invalidate() {},
        forget() {},
        listModels: async () => [],
        accountStatus: () => ({}),
        cachedModels: () => [],
      },
    },
  )
  const reqJson = (method, path, body) =>
    new Promise((resolve) => {
      const res = makeRes()
      handler(makeReq(method, path, body), res)
      const poll = () => {
        if (res.body) resolve({ status: res.statusCode, body: JSON.parse(res.body) })
        else setTimeout(poll, 5)
      }
      poll()
    })
  try {
    const stalePromise = reqJson('GET', `${PREFIX}/state?quota=0`)
    await new Promise((resolve) => setTimeout(resolve, 15))
    const refreshed = await reqJson('POST', `${PREFIX}/models/refresh`, {
      channelId: descriptor.id,
    })
    assert.equal(refreshed.status, 200)
    releaseFirst()
    await stalePromise
    const fresh = await reqJson('GET', `${PREFIX}/state?quota=0`)
    assert.deepEqual(
      fresh.body.channels[0].models.map((m) => m.id),
      ['fresh-model'],
    )
    assert.equal(callIndex, 2)
  } finally {
    releaseFirst()
    cleanup()
  }
})

test('/state includes legacy alias ids in allModels for canonical deduplicated models', async () => {
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
      registry: { all: () => [descriptor], loadInfo: () => loadInfo },
      accounts: {
        get: async () => account,
        list: async () => [account],
        nextAccountId: async () => 'acct-2',
        save: async (next) => next,
      },
      worker: {
        listModels: async () => ({
          models: [
            { ...model, id: 'deepseek-v4.1-flash_advisor_', name: 'DeepSeek V4.1 Flash' },
            { ...model, id: 'deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash' },
          ],
          liveFailed: false,
        }),
        usage: async () => ({ windows: [] }),
      },
      adapter: {
        invalidate() {},
        forget() {},
        listModels: async () => [],
        accountStatus: () => ({}),
        cachedModels: () => [],
      },
    },
  )
  try {
    const res = makeRes()
    handler(makeReq('GET', `${PREFIX}/state?quota=0`), res)
    for (let i = 0; i < 100 && !res.body; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    const body = JSON.parse(res.body)
    assert.deepEqual(body.channels[0].allModels, [
      {
        id: 'deepseek-v4.1-flash',
        name: 'DeepSeek V4.1 Flash',
        free: true,
        freeKnown: true,
        aliases: ['deepseek-v4.1-flash_advisor_'],
      },
    ])
  } finally {
    cleanup()
  }
})
