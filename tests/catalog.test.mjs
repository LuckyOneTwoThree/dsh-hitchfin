import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import {
  normalizeModels,
  isInternalModel,
  humanizeModelId,
} from '../worker/channel-contract.mjs'
import {
  dedupeModels,
  isModelHidden,
  resolveHiddenNames,
  looseModelKey,
  selectVisibleModels,
} from '../lib/models.js'
import { readModelListing, ChannelWorkerHost } from '../lib/host/worker-host.js'
import { HitchfinAdapter } from '../lib/adapter/hitchfin-adapter.js'
import { registerHitchfinRoutes } from '../lib/routes.js'

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
  exportName: 'FixtureCatalogPlugin',
  fallbackPath: '/tmp/mock.mjs',
}

const account = {
  channelId: descriptor.id,
  accountId: 'acct-1',
  label: 'mock',
  auth: { type: 'oauth', access: 'token' },
  freeOnly: false,
  hiddenModels: [],
  createdAt: 0,
  updatedAt: 0,
}

function model(id, name = 'A Model', extra = {}) {
  return {
    id,
    name,
    free: false,
    freeKnown: false,
    input: ['text'],
    efforts: [],
    ...extra,
  }
}

// ---------------------------------------------------------------------------
// P1: internal helpers and nameless entries

test('normalizeModels filters Trae internal helpers only when asked', () => {
  const catalog = {
    'glm-4.6': { name: 'GLM-4.6', limit: { context: 116000 } },
    'glm-4.6-auto': { name: 'GLM-4.6', limit: { context: 128000 } },
    'kimi-k3-auto-max': { name: 'Kimi-K3 (Max)', limit: { context: 200000 } },
    computer_use_subagent: { name: 'computer_use_subagent' },
    file_search_agent: { name: 'search_agent_qwen_fast' },
    explore_sub_agent_v2: { name: 'explore_sub_agent_v2' },
    doubao_for_auto: { name: 'doubao-for-auto' },
    'normal-model': { name: 'Normal Model' },
  }
  assert.equal(normalizeModels(catalog).length, 8)
  assert.deepEqual(
    normalizeModels(catalog, { filterInternal: true }).map((entry) => entry.id),
    ['glm-4.6', 'normal-model'],
  )
})

test('isInternalModel only matches vendor-internal routing entries', () => {
  assert.equal(isInternalModel('glm-4.6-auto', 'GLM-4.6'), true)
  assert.equal(isInternalModel('Doubao-Seed-2.1-Turbo-auto', 'Seed-2.1-Turbo'), true)
  assert.equal(isInternalModel('computer_use_subagent', 'computer_use_subagent'), true)
  assert.equal(isInternalModel('search_agent_qwen_fast-0710', 'x'), true)
  assert.equal(isInternalModel('glm-5.3', 'GLM-5.3'), false)
  assert.equal(isInternalModel('deepseek-v4.1-flash', 'DeepSeek-V4.1-Flash'), false)
  assert.equal(humanizeModelId('sagitta'), 'Sagitta')
  assert.equal(humanizeModelId('seed_code_pro'), 'Seed Code Pro')
})

test('normalizeModels gives a nameless Trae entry a readable label', () => {
  const out = normalizeModels(
    { sagitta: { name: '-' }, aquila: { name: '  ' } },
    { humanizeEmptyNames: true },
  )
  assert.deepEqual(out.map((entry) => entry.name), ['Sagitta', 'Aquila'])
  assert.deepEqual(
    dedupeModels(
      out.map((entry) => model(entry.id, entry.name)),
    ).map((entry) => entry.id),
    ['sagitta', 'aquila'],
  )
})

test('dedupeModels prefers the canonical id over a larger-window -auto twin', () => {
  const out = dedupeModels([
    model('glm-4.6-auto', 'GLM-4.6', { contextWindow: 128000 }),
    model('glm-4.6', 'GLM-4.6', { contextWindow: 116000 }),
    model('glm-4.6_advisor_', 'GLM-4.6', { contextWindow: 200000 }),
  ])
  assert.deepEqual(out.map((entry) => entry.id), ['glm-4.6'])
})

// ---------------------------------------------------------------------------
// P2: hidden tokens survive a vendor rename

test('a hidden name survives a separator-only rename', () => {
  assert.equal(looseModelKey('Kimi K2.6'), looseModelKey('Kimi-K2.6'))
  assert.equal(looseModelKey('DeepSeek V4 Pro'), looseModelKey('DeepSeek-V4-Pro'))
  const hidden = new Set(['kimi k2.6'])
  assert.equal(isModelHidden({ id: 'kimi-k2.6', name: 'Kimi-K2.6' }, hidden), true)
  const raw = [model('kimi-k2.6', 'Kimi-K2.6')]
  assert.deepEqual([...resolveHiddenNames(raw, new Set(['Kimi K2.6']))], ['kimi-k2.6'])
  assert.equal(selectVisibleModels(raw, new Set(['Kimi K2.6']), false).models.length, 0)
})

test('storing a name and its id keeps the whole alias group hidden', () => {
  const raw = [
    model('glm-4.6', 'GLM-4.6'),
    model('glm-4.6-auto', 'GLM-4.6'),
  ]
  const tokens = new Set(['glm-4.6', 'glm-4.6-auto'])
  assert.equal(isModelHidden(raw[0], tokens), true)
  assert.equal(isModelHidden(raw[1], tokens), true)
  assert.deepEqual([...resolveHiddenNames(raw, tokens)], ['glm-4.6'])
})

// ---------------------------------------------------------------------------
// P0: status-aware listings

test('readModelListing accepts a plain models double', async () => {
  const models = [model('a')]
  const listing = await readModelListing({ models: async () => models }, {}, 100)
  assert.deepEqual(listing, { models, liveFailed: false })
})

test('readModelListing forwards a status-aware host', async () => {
  const listing = await readModelListing(
    {
      models: async () => [],
      listModels: async () => ({ models: [], liveFailed: true, error: 'vendor down' }),
    },
    {},
    100,
  )
  assert.equal(listing.liveFailed, true)
  assert.equal(listing.error, 'vendor down')
})

const FIXTURE = fileURLToPath(
  new URL('./fixtures/live-catalog-channel/index.mjs', import.meta.url),
)
const fixtureChannel = {
  channelId: 'trae-cn',
  packagePath: FIXTURE,
  exportName: 'FixtureCatalogPlugin',
  provider: 'fixture-catalog',
}

test('worker flags a static fallback and reload clears the negative cache', async () => {
  const host = new ChannelWorkerHost({ defaultTimeoutMs: 8000 })
  try {
    const failed = await host.listModels({
      channel: fixtureChannel,
      auth: { mode: 'poison' },
    })
    assert.equal(failed.liveFailed, true)
    assert.deepEqual(failed.models, [])
    assert.ok(failed.error)
    // The failed read is remembered inside the plugin instance (Trae's five
    // minute negative cache), so a plain retry still fails.
    const cached = await host.listModels({ channel: fixtureChannel, auth: {} })
    assert.equal(cached.liveFailed, true)
    assert.equal(await host.reloadChannel(fixtureChannel), 1)
    const good = await host.listModels({ channel: fixtureChannel, auth: {} })
    assert.equal(good.liveFailed, false)
    assert.deepEqual(
      good.models.map((entry) => entry.id),
      ['live-b', 'nameless-one'],
    )
    assert.equal(good.models[1].name, 'Nameless One')
  } finally {
    await host.stop()
  }
})

// ---------------------------------------------------------------------------
// P0: /state and adapter must not publish the placeholder table

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

function makeServices(worker, adapterExtra = {}) {
  return {
    registry: {
      all: () => [descriptor],
      loadInfo: () => ({
        channelId: descriptor.id,
        packagePath: FIXTURE,
        exportName: descriptor.exportName,
        provider: descriptor.packageProvider,
      }),
      packageInfo: () => ({
        path: FIXTURE,
        source: 'installed',
        version: '0.0.0',
        expectedVersion: descriptor.packageVersion,
        versionMatches: false,
      }),
      get: (provider) => (provider === descriptor.providerId ? descriptor : undefined),
      providerIds: () => [descriptor.providerId],
    },
    accounts: { list: async () => [account] },
    worker,
    adapter: {
      invalidate() {},
      forget() {},
      listModels: async () => [],
      accountStatus: () => ({}),
      cachedModels: () => [],
      ...adapterExtra,
    },
  }
}

async function request(services, method, path, body) {
  let handler
  const emitted = []
  const ctx = {
    webServer: {
      register(route) {
        handler = route.handler
        return () => {}
      },
    },
    logger: { info() {}, warn() {} },
    emit: (event, provider) => emitted.push([event, provider]),
    get: () => undefined,
  }
  const cleanup = registerHitchfinRoutes(ctx, services)
  const req = makeReq(method, path)
  if (body !== undefined) {
    req[Symbol.asyncIterator] = async function* () {
      yield Buffer.from(JSON.stringify(body))
    }
  }
  const res = makeRes()
  handler(req, res)
  for (let i = 0; i < 200 && !res.body; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  cleanup()
  return { status: res.statusCode, body: JSON.parse(res.body), emitted }
}

const placeholder = model('static-a', 'Static A')

test('/state reports the failure and never publishes the placeholder table', async () => {
  const services = makeServices({
    listModels: async () => ({
      models: [placeholder],
      liveFailed: true,
      error: 'vendor down',
    }),
    usage: async () => ({}),
  })
  const { body } = await request(services, 'GET', '/dsh-hitchfin/state?quota=0')
  const channel = body.channels[0]
  assert.equal(channel.modelsError, 'vendor down')
  assert.equal(channel.models.some((entry) => entry.id === 'static-a'), false)
  assert.equal(channel.allModels.some((entry) => entry.id === 'static-a'), false)
  assert.equal(channel.accounts[0].error, 'vendor down')
})

test('/state falls back to the adapter\'s last good catalog on failure', async () => {
  const cached = [
    {
      provider: descriptor.providerId,
      id: 'live-b',
      name: 'Live B',
      badge: { text: { en: 'Free', zh: '免费' }, tone: 'success' },
    },
  ]
  const services = makeServices(
    {
      listModels: async () => ({ models: [], liveFailed: true, error: 'vendor down' }),
      usage: async () => ({}),
    },
    { cachedModels: () => cached },
  )
  const { body } = await request(services, 'GET', '/dsh-hitchfin/state?quota=0')
  const channel = body.channels[0]
  assert.equal(channel.modelsError, 'vendor down')
  assert.deepEqual(channel.models.map((entry) => entry.id), ['live-b'])
  assert.equal(channel.models[0].free, true)
})

test('/models/refresh reloads the channel package and invalidates the adapter', async () => {
  let reloaded = 0
  let invalidated = 0
  const services = makeServices(
    {
      listModels: async () => ({ models: [], liveFailed: false }),
      usage: async () => ({}),
      reloadChannel: async () => {
        reloaded += 1
        return 1
      },
    },
    {
      invalidate: () => {
        invalidated += 1
      },
    },
  )
  const { status, body, emitted } = await request(
    services,
    'POST',
    '/dsh-hitchfin/models/refresh',
    { channelId: descriptor.id },
  )
  assert.equal(status, 200)
  assert.equal(body.ok, true)
  assert.equal(reloaded, 1)
  assert.equal(invalidated, 1)
  assert.deepEqual(emitted, [['llm/models-updated', descriptor.providerId]])
})

function makeAdapter(worker) {
  return new HitchfinAdapter({
    registry: {
      get: (provider) => (provider === descriptor.providerId ? descriptor : undefined),
      loadInfo: () => ({
        channelId: descriptor.id,
        packagePath: FIXTURE,
        exportName: descriptor.exportName,
        provider: descriptor.packageProvider,
      }),
      providerIds: () => [descriptor.providerId],
      all: () => [descriptor],
    },
    accounts: { list: async () => [account] },
    worker,
    logger: { info() {}, warn() {}, error() {} },
  })
}

test('adapter keeps the last complete catalog when a live read fails', async () => {
  const worker = {
    listModels: async () => ({
      models: [model('live-b', 'Live B', { free: true, freeKnown: true })],
      liveFailed: false,
    }),
  }
  const adapter = makeAdapter(worker)
  const first = await adapter.listModels(descriptor.providerId)
  assert.deepEqual(first.map((entry) => entry.id), ['live-b'])
  assert.equal(adapter.cachedModels(descriptor.providerId).length, 1)

  adapter.invalidate(descriptor.providerId)
  worker.listModels = async () => ({
    models: [placeholder],
    liveFailed: true,
    error: 'vendor down',
  })
  const second = await adapter.listModels(descriptor.providerId)
  assert.deepEqual(second.map((entry) => entry.id), ['live-b'])
  assert.equal(second.some((entry) => entry.id === 'static-a'), false)
})
