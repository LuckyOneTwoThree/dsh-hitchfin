import './_fresh.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { HitchfinAdapter } from '../lib/adapter/hitchfin-adapter.js'
import { HitchfinError } from '../lib/errors.js'

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

function model(id) {
  return {
    id,
    name: id,
    input: ['text'],
    efforts: [],
    free: false,
    freeKnown: true,
  }
}

function openAiStream(text = 'ok') {
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

function harness(specs, responseFor = () => openAiStream()) {
  const calls = []
  const accounts = specs.map((spec) => ({
    channelId: descriptor.id,
    accountId: spec.accountId,
    label: spec.accountId,
    auth: { type: 'oauth', access: 'token' },
    freeOnly: spec.freeOnly ?? false,
    enabled: spec.enabled ?? true,
    createdAt: 0,
    updatedAt: 0,
  }))
  const worker = {
    models: async ({ accountId }) => {
      const spec = specs.find((entry) => entry.accountId === accountId)
      if (spec?.fail) throw new Error('upstream model listing failed')
      return spec?.models ?? []
    },
    fetch: async (url, init, options) => {
      calls.push({ url, accountId: options.accountId })
      return responseFor(options.accountId)
    },
  }
  const adapter = new HitchfinAdapter({
    registry: {
      get: (provider) => (provider === descriptor.providerId ? descriptor : undefined),
      loadInfo: () => ({
        channelId: descriptor.id,
        packagePath: '/tmp/mock.mjs',
        exportName: 'Mock',
        provider: 'workbuddy',
      }),
      providerIds: () => [descriptor.providerId],
      all: () => [descriptor],
    },
    accounts: { list: async () => accounts },
    worker,
    logger: { info() {}, warn() {}, error() {} },
  })
  return { adapter, calls }
}

function generateOptions(modelId) {
  return {
    provider: descriptor.providerId,
    model: modelId,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    sessionId: 'session-1',
  }
}

async function collect(iterable) {
  const chunks = []
  for await (const chunk of iterable) chunks.push(chunk)
  return chunks
}

test('a model is only routed to accounts that actually expose it', async () => {
  const { adapter, calls } = harness([
    { accountId: 'acct-1', models: [model('glm-5.3')] },
    { accountId: 'acct-2', models: [model('kimi-k3-1')] },
  ])
  const chunks = await collect(adapter.stream(generateOptions('glm-5.3')))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].accountId, 'acct-1')
  assert.equal(chunks.at(-1).type, 'finish')
})

test('shared models keep the normal sticky ordering', async () => {
  const { adapter, calls } = harness([
    { accountId: 'acct-1', models: [model('glm-5.3')] },
    { accountId: 'acct-2', models: [model('glm-5.3')] },
  ])
  await collect(adapter.stream(generateOptions('glm-5.3')))
  assert.equal(calls.length, 1)
  assert.deepEqual(
    calls.map((call) => call.accountId),
    ['acct-1'],
  )
})

test('an incomplete model listing falls back to unrestricted routing', async () => {
  const { adapter, calls } = harness(
    [
      { accountId: 'acct-1', models: [model('glm-5.3')] },
      { accountId: 'acct-2', models: [], fail: true },
    ],
    (accountId) =>
      accountId === 'acct-1' ? new Response('{}', { status: 500 }) : openAiStream('from acct-2'),
  )
  const chunks = await collect(adapter.stream(generateOptions('glm-5.3')))
  assert.deepEqual(
    calls.map((call) => call.accountId),
    ['acct-1', 'acct-2'],
  )
  assert.equal(chunks.at(-1).type, 'finish')
})

test('a disabled account does not expose its models or receive their requests', async () => {
  const { adapter, calls } = harness([
    { accountId: 'acct-1', models: [model('shared')] },
    { accountId: 'acct-2', models: [model('disabled-only')], enabled: false },
  ])
  const models = await adapter.listModels(descriptor.providerId)
  assert.deepEqual(models.map((entry) => entry.id), ['shared'])

  const chunks = await collect(adapter.stream(generateOptions('disabled-only')))
  assert.equal(calls.length, 0)
  assert.equal(chunks.at(-1).reason.failure.code, 'MODEL_NOT_FOUND')
})

test('free-only excludes a known paid model from routing', async () => {
  const { adapter, calls } = harness([
    {
      accountId: 'acct-1',
      freeOnly: true,
      models: [
        { ...model('free-model'), free: true, freeKnown: true },
        { ...model('paid-model'), free: false, freeKnown: true },
      ],
    },
  ])
  const models = await adapter.listModels(descriptor.providerId)
  assert.deepEqual(models.map((entry) => entry.id), ['free-model'])

  const chunks = await collect(adapter.stream(generateOptions('paid-model')))
  assert.equal(calls.length, 0)
  assert.equal(chunks.at(-1).reason.failure.code, 'MODEL_NOT_FOUND')
})

test('no owning account produces an explicit MODEL_NOT_FOUND finish', async () => {
  const { adapter, calls } = harness([
    { accountId: 'acct-1', models: [model('glm-5.3')] },
  ])
  // Pre-seed both indexes so protocolFor does not refresh the catalog.
  adapter.protocols.set(`${descriptor.providerId}\0ghost-model`, 'openai-completions')
  adapter.modelAccounts.set(`${descriptor.providerId}\0ghost-model`, new Set(['acct-9']))
  const chunks = await collect(adapter.stream(generateOptions('ghost-model')))
  assert.equal(calls.length, 0)
  assert.equal(chunks.at(-1).reason.failure.code, 'MODEL_NOT_FOUND')
})

test('cooldown message counts only accounts that actually offer the model', async () => {
  const { adapter } = harness(
    [
      { accountId: 'acct-1', models: [model('glm-5.3')] },
      { accountId: 'acct-2', models: [model('kimi-k3-1')] },
    ],
    () => new Response(JSON.stringify({ error: { message: 'rate limited' } }), { status: 429 }),
  )
  const first = await collect(adapter.stream(generateOptions('glm-5.3')))
  assert.equal(first.at(-1).reason.failure.code, 'RATE_LIMIT')

  const second = await collect(adapter.stream(generateOptions('glm-5.3')))
  assert.equal(second.at(-1).reason.failure.code, 'RATE_LIMIT')
  assert.match(second.at(-1).reason.failure.message, /the account is cooling down/)
})

test('ownership index recovers automatically after a transient account listing failure', async () => {
  const specs = [
    { accountId: 'acct-1', models: [model('glm-5.3')] },
    { accountId: 'acct-2', models: [model('kimi-k3-1')], fail: true },
  ]
  const { adapter, calls } = harness(specs)
  // First listing is incomplete because acct-2 fails.
  await adapter.listModels(descriptor.providerId)
  assert.equal(adapter.modelAccounts.size, 0)

  // Transient error clears; next stream call should refresh and rebuild ownership.
  specs[1].fail = false
  await collect(adapter.stream(generateOptions('kimi-k3-1')))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].accountId, 'acct-2')
})

test('an empty 200 stream cools the account and fails over once', async () => {
  const empty = () =>
    new Response(new ReadableStream({ start: (controller) => controller.close() }), {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    })
  const { adapter, calls } = harness(
    [
      { accountId: 'acct-1', models: [model('glm-5.3')] },
      { accountId: 'acct-2', models: [model('glm-5.3')] },
    ],
    (accountId) => (accountId === 'acct-1' ? empty() : openAiStream()),
  )

  const first = await collect(adapter.stream(generateOptions('glm-5.3')))
  assert.equal(first.at(-1).type, 'finish')
  assert.equal(calls.map((call) => call.accountId).join(','), 'acct-1,acct-2')

  // A fresh session must start on acct-2: acct-1 is cooling from EMPTY_RESPONSE.
  const second = await collect(
    adapter.stream({ ...generateOptions('glm-5.3'), sessionId: 'session-2' }),
  )
  assert.equal(second.at(-1).type, 'finish')
  assert.equal(calls.at(-1).accountId, 'acct-2')
  assert.equal(calls.length, 3)
})

test('an unlisted failure code still cools the account', async () => {
  const { adapter, calls } = harness(
    [{ accountId: 'acct-1', models: [model('glm-5.3')] }],
    () => {
      throw new HitchfinError('weird upstream failure', 'SOMETHING_NEW')
    },
  )

  const first = await collect(adapter.stream(generateOptions('glm-5.3')))
  assert.equal(first.at(-1).reason.failure.code, 'SOMETHING_NEW')

  const second = await collect(adapter.stream(generateOptions('glm-5.3')))
  assert.match(second.at(-1).reason.failure.message, /cooling down/)
  assert.equal(calls.length, 1)
})

test('Retry-After extends a non-429 cooldown', async () => {
  const { adapter } = harness(
    [{ accountId: 'acct-1', models: [model('glm-5.3')] }],
    () => new Response('busy', { status: 503, headers: { 'retry-after': '120' } }),
  )

  await collect(adapter.stream(generateOptions('glm-5.3')))
  const second = await collect(adapter.stream(generateOptions('glm-5.3')))
  // The provider asked for 120s; the default SERVER cooldown is 60s.
  assert.match(second.at(-1).reason.failure.message, /retry in 1[12]\ds/)
})

test('408 fails over instead of short-circuiting as an invalid request', async () => {
  const { adapter, calls } = harness(
    [
      { accountId: 'acct-1', models: [model('glm-5.3')] },
      { accountId: 'acct-2', models: [model('glm-5.3')] },
    ],
    (accountId) =>
      accountId === 'acct-1' ? new Response('timeout', { status: 408 }) : openAiStream(),
  )

  const chunks = await collect(adapter.stream(generateOptions('glm-5.3')))
  assert.equal(calls.length, 2)
  assert.equal(chunks.at(-1).type, 'finish')
  assert.notEqual(chunks.at(-1).reason.kind, 'error')
})

test('a stopped worker does not put the account into cooldown', async () => {
  let stopped = true
  const { adapter, calls } = harness(
    [{ accountId: 'acct-1', models: [model('glm-5.3')] }],
    () => {
      if (stopped) throw new HitchfinError('worker stopped', 'WORKER_STOPPED')
      return openAiStream()
    },
  )

  const first = await collect(adapter.stream(generateOptions('glm-5.3')))
  assert.equal(first.at(-1).reason.failure.code, 'WORKER_STOPPED')

  stopped = false
  const second = await collect(
    adapter.stream({ ...generateOptions('glm-5.3'), sessionId: 'session-2' }),
  )
  assert.equal(second.at(-1).type, 'finish')
  assert.equal(calls.length, 2)
})
