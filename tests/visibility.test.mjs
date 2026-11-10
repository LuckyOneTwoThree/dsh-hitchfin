import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canonicalHiddenNames,
  dedupeModels,
  isModelHidden,
  selectVisibleModels,
} from '../lib/models.js'
import { registerHitchfinRoutes } from '../lib/routes.js'
import { HitchfinAdapter } from '../lib/adapter/hitchfin-adapter.js'

const NAME = 'DeepSeek-V4-Flash'

function model(id, name = NAME, extra = {}) {
  return { id, name, free: false, freeKnown: false, input: ['text'], efforts: [], ...extra }
}

const aliases = [
  model('deepseek-v4.1-flash'),
  model('deepseek-v4.1-flash-Official'),
  model('deepseek-v4.1-flash_advisor_'),
]
const catalog = [...aliases, model('glm-5.3', 'GLM-5.3')]

// ---------------------------------------------------------------------------
// Shared visibility function

test('hiding a canonical name removes every alias id', () => {
  const hidden = new Set([NAME.toLowerCase()])
  const selection = selectVisibleModels(catalog, hidden, false)
  assert.equal(selection.candidates.length, 1)
  assert.equal(selection.models.length, 1)
  assert.equal(selection.models[0].name, 'GLM-5.3')
  assert.equal(selection.models.some((m) => m.name === NAME), false)
})

test('settings path and adapter path now produce the same ids', () => {
  const hidden = new Set([NAME.toLowerCase()])
  const settingsPath = dedupeModels(
    catalog.filter((m) => !isModelHidden(m, hidden)),
  )
  const selection = selectVisibleModels(catalog, hidden, false)
  const adapterPath = dedupeModels(selection.candidates)
  assert.deepEqual(
    settingsPath.map((m) => m.id),
    adapterPath.map((m) => m.id),
  )
  assert.deepEqual(
    adapterPath.map((m) => m.id),
    ['glm-5.3'],
  )
})

test('legacy id tokens still hide the whole name group', () => {
  const winner = dedupeModels(aliases)[0]
  const hidden = new Set([winner.id])
  const selection = selectVisibleModels(catalog, hidden, false)
  assert.equal(selection.models.some((m) => m.name === NAME), false)
  assert.deepEqual(selection.models.map((m) => m.id), ['glm-5.3'])
})

test('freeOnly keeps its original semantics when free metadata exists', () => {
  const withFree = [
    model('free-a', 'Free A', { free: true, freeKnown: true }),
    model('paid-a', 'Paid A', { free: false, freeKnown: true }),
  ]
  assert.deepEqual(
    selectVisibleModels(withFree, new Set(), true).models.map((m) => m.id),
    ['free-a'],
  )
  assert.equal(selectVisibleModels(withFree, new Set(), false).models.length, 2)
  assert.equal(selectVisibleModels(catalog, new Set(), true).models.length, 2)
})

test('canonicalHiddenNames resolves legacy ids and keeps the account intersection', () => {
  const rawById = new Map(catalog.map((m) => [m.id, m]))
  assert.deepEqual(
    canonicalHiddenNames(rawById, [['deepseek-v4.1-flash'], [NAME.toLowerCase()]]),
    ['deepseek-v4-flash'],
  )
  assert.deepEqual(
    canonicalHiddenNames(rawById, [['deepseek-v4.1-flash'], ['glm-5.3']]),
    [],
  )
  assert.deepEqual(
    canonicalHiddenNames(rawById, [[NAME.toLowerCase(), 'retired-model']]),
    ['deepseek-v4-flash', 'retired-model'],
  )
  assert.deepEqual(canonicalHiddenNames(rawById, []), [])
})

// ---------------------------------------------------------------------------
// End-to-end: settings /state and DSH adapter must agree

const descriptor = {
  id: 'trae-cn',
  providerId: 'hitchfin-trae-cn',
  packageProvider: 'trae-cn',
  displayName: 'Trae CN',
  status: 'experimental',
  protocols: ['openai-completions'],
  authMethods: [],
  freeOnlyDefault: true,
  supportsFreeWindow: false,
  packageName: 'mock',
  packageVersion: '0.0.0',
  exportName: 'Mock',
  fallbackPath: '/tmp/mock.mjs',
}

function makeReq(method, path) {
  return {
    method,
    url: path,
    headers: { origin: 'http://127.0.0.1' },
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() {},
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

async function stateFor(hiddenTokens) {
  let handler
  const account = {
    channelId: descriptor.id,
    accountId: 'acct-1',
    label: 'mock',
    auth: { type: 'oauth', access: 'token' },
    freeOnly: false,
    hiddenModels: hiddenTokens,
    createdAt: 0,
    updatedAt: 0,
  }
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
        provider: 'trae-cn',
      }),
      get: (provider) => (provider === descriptor.providerId ? descriptor : undefined),
      providerIds: () => [descriptor.providerId],
    },
    accounts: { list: async () => [account] },
    worker: {
      models: async () => catalog,
      usage: async () => ({}),
      authorize: async () => ({}),
      callback: async () => ({ auth: {} }),
      apiKey: async () => ({ auth: {} }),
      cancelAuth() {},
    },
    adapter: { invalidate() {}, forget() {}, listModels: async () => [] },
  }
  const cleanup = registerHitchfinRoutes(ctx, services)
  const res = makeRes()
  handler(makeReq('GET', '/dsh-hitchfin/state?quota=0'), res)
  for (let i = 0; i < 100 && !res.body; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  cleanup()
  return JSON.parse(res.body).channels[0]
}

test('/state hides the name group and reports canonical hidden names', async () => {
  const channel = await stateFor([NAME.toLowerCase()])
  assert.equal(channel.models.some((m) => m.name === NAME), false)
  assert.deepEqual(channel.hiddenModels, [NAME.toLowerCase()])
  assert.equal(channel.allModels.some((m) => m.name === NAME), true)
})

test('/state still honours legacy id tokens', async () => {
  const channel = await stateFor(['deepseek-v4.1-flash'])
  assert.equal(channel.models.some((m) => m.name === NAME), false)
  assert.deepEqual(channel.hiddenModels, [NAME.toLowerCase()])
})

test('adapter.listModels no longer resurrects an alias after hiding', async () => {
  const account = {
    channelId: descriptor.id,
    accountId: 'acct-1',
    label: 'mock',
    auth: { type: 'oauth', access: 'token' },
    freeOnly: false,
    hiddenModels: [NAME.toLowerCase()],
    createdAt: 0,
    updatedAt: 0,
  }
  const adapter = new HitchfinAdapter({
    registry: {
      get: (provider) => (provider === descriptor.providerId ? descriptor : undefined),
      loadInfo: () => ({
        channelId: descriptor.id,
        packagePath: '/tmp/mock.mjs',
        exportName: 'Mock',
        provider: 'trae-cn',
      }),
      providerIds: () => [descriptor.providerId],
      all: () => [descriptor],
    },
    accounts: { list: async () => [account] },
    worker: { models: async () => catalog },
    logger: { info() {}, warn() {}, error() {} },
  })
  const models = await adapter.listModels(descriptor.providerId)
  assert.equal(models.some((m) => m.name === NAME), false)
  assert.deepEqual(models.map((m) => m.id), ['glm-5.3'])
})
