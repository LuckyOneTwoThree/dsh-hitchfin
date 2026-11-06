import test from 'node:test'
import assert from 'node:assert/strict'
import { HitchfinAdapter, SPIKE_PROVIDER } from '../lib/adapter/hitchfin-adapter.js'
import { dedupeModels } from '../lib/models.js'

const descriptor = {
  id: 'workbuddy-cn',
  providerId: 'hitchfin-workbuddy-cn',
  packageProvider: 'workbuddy',
  displayName: 'WorkBuddy CN',
  status: 'stable',
  protocols: ['openai-completions'],
  authMethods: [{ id: 'browser', label: 'Browser', kind: 'browser' }],
  freeOnlyDefault: true,
  supportsFreeWindow: true,
  packageName: '@magpie-community/opencode-workbuddy-auth',
  packageVersion: '0.2.24',
  exportName: 'WorkBuddyAuthPlugin',
  fallbackPath: '/tmp/mock-workbuddy.mjs',
}

function makeRegistry() {
  return {
    get: (provider) => (provider === descriptor.providerId ? descriptor : undefined),
    loadInfo: () => ({
      channelId: descriptor.id,
      packagePath: descriptor.fallbackPath,
      exportName: descriptor.exportName,
      provider: descriptor.packageProvider,
    }),
    providerIds: () => [descriptor.providerId],
    all: () => [descriptor],
  }
}

function makeAccounts(entries = []) {
  return {
    list: async () => entries,
    get: async () => entries[0],
  }
}

function sseResponse(text = 'hello from mock channel') {
  const body = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            choices: [{ index: 0, delta: { role: 'assistant', content: text }, finish_reason: null }],
          })}\n\n`,
        ),
      )
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
            usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
          })}\n\n`,
        ),
      )
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })
}

function makeWorker() {
  return {
    models: async () => [
      {
        id: 'free-model',
        name: 'Free Model',
        contextWindow: 128000,
        input: ['text'],
        efforts: ['low', 'high'],
        free: true,
        freeKnown: true,
      },
      {
        id: 'paid-model',
        name: 'Paid Model',
        contextWindow: 200000,
        maxTokens: 32000,
        input: ['text', 'image'],
        efforts: [],
        free: false,
        freeKnown: true,
      },
    ],
    fetch: async () => sseResponse(),
  }
}

const logger = { info() {}, warn() {}, error() {} }

function makeAdapter({ accounts = makeAccounts(), worker = makeWorker() } = {}) {
  return new HitchfinAdapter({
    registry: makeRegistry(),
    accounts,
    worker,
    logger,
    devSpike: true,
  })
}

test('spike adapter still lists and streams', async () => {
  const adapter = makeAdapter()
  const models = await adapter.listModels(SPIKE_PROVIDER)
  assert.equal(models.length, 1)
  assert.equal(models[0].id, 'spike-model')

  const chunks = []
  for await (const chunk of adapter.stream({ provider: SPIKE_PROVIDER, model: 'spike-model', messages: [] })) {
    chunks.push(chunk)
  }
  assert.deepEqual(
    chunks.map((chunk) => chunk.type),
    ['block-start', 'text-delta', 'block-end', 'usage', 'finish'],
  )
  assert.equal(chunks[1].text, 'hello from hitchfin scaffold')
})

test('channel adapter filters paid models by default and maps metadata', async () => {
  const account = {
    channelId: descriptor.id,
    accountId: 'acct-1',
    label: 'Test',
    auth: { type: 'oauth', access: 'token' },
    freeOnly: true,
    createdAt: 0,
    updatedAt: 0,
  }
  const adapter = makeAdapter({ accounts: makeAccounts([account]) })
  const models = await adapter.listModels(descriptor.providerId)
  assert.deepEqual(models.map((model) => model.id), ['free-model'])
  assert.equal(models[0].badge?.tone, 'success')
  assert.equal(models[0].context?.contextWindow, 128000)
  assert.deepEqual(models[0].reasoning?.efforts.map((effort) => effort.id), ['low', 'high'])
})

test('channel adapter streams through the worker SSE proxy', async () => {
  const account = {
    channelId: descriptor.id,
    accountId: 'acct-1',
    label: 'Test',
    auth: { type: 'oauth', access: 'token' },
    freeOnly: true,
    createdAt: 0,
    updatedAt: 0,
  }
  const adapter = makeAdapter({ accounts: makeAccounts([account]) })
  const chunks = []
  for await (const chunk of adapter.stream({
    provider: descriptor.providerId,
    model: 'free-model',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
  })) {
    chunks.push(chunk)
  }
  assert.deepEqual(
    chunks.map((chunk) => chunk.type),
    ['block-start', 'text-delta', 'block-end', 'usage', 'finish'],
  )
  assert.equal(chunks[1].text, 'hello from mock channel')
  assert.equal(chunks[3].usage.inputTokens, 2)
  assert.equal(chunks[3].usage.outputTokens, 3)
  assert.equal(chunks[4].reason.kind, 'stop')
})

test('dedupeModels keeps canonical ids for duplicate display names', () => {
  const models = dedupeModels([
    { id: 'glm-5.2_advisor_doubao', name: 'GLM-5.2', free: false, freeKnown: false },
    { id: 'glm-5.2', name: 'GLM-5.2', free: false, freeKnown: false },
    { id: 'glm-5.2-max', name: 'GLM-5.2 (Max)', free: false, freeKnown: false },
    { id: 'DeepSeek-V4-Flash-Official', name: 'DeepSeek-V4-Flash', free: false, freeKnown: false },
    { id: 'DeepSeek-V4-Flash', name: 'DeepSeek-V4-Flash', free: false, freeKnown: false },
    { id: 'Doubao_1_6', name: 'Seed-Code', free: false, freeKnown: false },
    { id: 'Doubao-Seed-Code', name: 'Seed-Code', free: false, freeKnown: false },
    { id: 'broken', name: '-', free: false, freeKnown: false },
  ])
  assert.deepEqual(
    models.map((model) => model.id).sort(),
    ['DeepSeek-V4-Flash', 'Doubao-Seed-Code', 'glm-5.2', 'glm-5.2-max'],
  )
})

test('channel adapter shows all models when free metadata is unknown', async () => {
  const account = {
    channelId: descriptor.id,
    accountId: 'acct-1',
    label: 'Test',
    auth: { type: 'oauth', access: 'token' },
    freeOnly: true,
    createdAt: 0,
    updatedAt: 0,
  }
  const worker = {
    models: async () => [
      {
        id: 'trae-a',
        name: 'Trae A',
        contextWindow: 100000,
        input: ['text'],
        efforts: [],
        free: false,
        freeKnown: false,
      },
      {
        id: 'trae-a-alias',
        name: 'Trae A',
        contextWindow: 100000,
        input: ['text'],
        efforts: [],
        free: false,
        freeKnown: false,
      },
    ],
    fetch: async () => sseResponse(),
  }
  const adapter = makeAdapter({ accounts: makeAccounts([account]), worker })
  const models = await adapter.listModels(descriptor.providerId)
  assert.deepEqual(models.map((model) => model.id), ['trae-a'])
})

test('channel adapter asks for sign-in when no account exists', async () => {
  const adapter = makeAdapter({ accounts: makeAccounts([]) })
  const chunks = []
  for await (const chunk of adapter.stream({
    provider: descriptor.providerId,
    model: 'free-model',
    messages: [],
  })) {
    chunks.push(chunk)
  }
  assert.equal(chunks.length, 1)
  assert.equal(chunks[0].type, 'finish')
  assert.equal(chunks[0].reason.kind, 'error')
  assert.equal(chunks[0].reason.failure.code, 'AUTH')
})
