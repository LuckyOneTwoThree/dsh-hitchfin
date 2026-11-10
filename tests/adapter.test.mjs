import test from 'node:test'
import assert from 'node:assert/strict'
import { HitchfinAdapter, SPIKE_PROVIDER } from '../lib/adapter/hitchfin-adapter.js'
import { buildOpenAiMessages } from '../lib/adapter/openai-sse.js'
import { HitchfinError } from '../lib/errors.js'
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

function makeRegistry(entry = descriptor) {
  return {
    get: (provider) => (provider === entry.providerId ? entry : undefined),
    loadInfo: () => ({
      channelId: entry.id,
      packagePath: entry.fallbackPath,
      exportName: entry.exportName,
      provider: entry.packageProvider,
    }),
    providerIds: () => [entry.providerId],
    all: () => [entry],
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

function account(accountId, overrides = {}) {
  return {
    channelId: descriptor.id,
    accountId,
    label: `Test ${accountId}`,
    auth: { type: 'oauth', access: `token-${accountId}` },
    freeOnly: true,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

function brokenSseResponse(text = 'partial') {
  const encoder = new TextEncoder()
  let stage = 0
  return new Response(
    new ReadableStream({
      pull(controller) {
        if (stage === 0) {
          stage = 1
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
              })}\n\n`,
            ),
          )
          return
        }
        controller.error(new Error('socket closed'))
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  )
}

function collect(stream) {
  return (async () => {
    const chunks = []
    for await (const chunk of stream) chunks.push(chunk)
    return chunks
  })()
}

const logger = { info() {}, warn() {}, error() {} }

function makeAdapter({
  accounts = makeAccounts(),
  worker = makeWorker(),
  readImage,
  registryDescriptor,
} = {}) {
  return new HitchfinAdapter({
    registry: makeRegistry(registryDescriptor),
    accounts,
    worker,
    logger,
    devSpike: true,
    ...(readImage ? { readImage } : {}),
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

test('adapter implements the host image contract methods', () => {
  const adapter = makeAdapter()
  // dsh-token-meter calls imageRequestPricing unconditionally; a missing
  // method is a TypeError during compaction, not a soft fallback.
  assert.equal(adapter.imageRequestPricing(descriptor.providerId, 'free-model'), undefined)
  assert.deepEqual(
    adapter.imageRequestTarget(descriptor.providerId, 'free-model', {
      attachmentId: 'sha256:test',
      mediaType: 'image/png',
      bytes: 30,
      width: 10,
      height: 20,
    }),
    { width: 10, height: 20, maxBytes: 30 },
  )
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

test('durable host image blocks are projected into the request body', async () => {
  const account = {
    channelId: descriptor.id,
    accountId: 'acct-1',
    label: 'Test',
    auth: { type: 'oauth', access: 'token' },
    freeOnly: false,
    createdAt: 0,
    updatedAt: 0,
  }
  const bodies = []
  const worker = {
    models: async () => [
      {
        id: 'vision-model',
        name: 'Vision Model',
        contextWindow: 128000,
        input: ['text', 'image'],
        efforts: [],
        free: false,
        freeKnown: true,
      },
    ],
    fetch: async (_input, init) => {
      bodies.push(JSON.parse(String(init.body)))
      return sseResponse()
    },
  }
  const readImage = async () => ({ data: Uint8Array.from([1, 2, 3]), mediaType: 'image/png' })
  const adapter = makeAdapter({ accounts: makeAccounts([account]), worker, readImage })
  const models = await adapter.listModels(descriptor.providerId)
  assert.deepEqual(models[0].inputModalities, ['text', 'image'])

  const chunks = []
  for await (const chunk of adapter.stream({
    provider: descriptor.providerId,
    model: 'vision-model',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            attachment: {
              attachmentId: 'sha256:test',
              mediaType: 'image/png',
              bytes: 3,
              width: 10,
              height: 10,
            },
          },
          { type: 'text', text: 'what is this?' },
        ],
      },
    ],
  })) {
    chunks.push(chunk)
  }
  assert.equal(chunks.at(-1).reason.kind, 'stop')
  const parts = bodies[0].messages[0].content
  assert.deepEqual(parts.find((part) => part.type === 'image_url').image_url.url, 'data:image/png;base64,AQID')
  assert.ok(parts.some((part) => part.type === 'text' && part.text === 'what is this?'))
})

test('without an attachment reader the catalog stops advertising images', async () => {
  const account = {
    channelId: descriptor.id,
    accountId: 'acct-1',
    label: 'Test',
    auth: { type: 'oauth', access: 'token' },
    freeOnly: false,
    createdAt: 0,
    updatedAt: 0,
  }
  const worker = {
    models: async () => [
      {
        id: 'vision-model',
        name: 'Vision Model',
        contextWindow: 128000,
        input: ['text', 'image'],
        efforts: [],
        free: false,
        freeKnown: true,
      },
    ],
    fetch: async () => sseResponse(),
  }
  const adapter = makeAdapter({ accounts: makeAccounts([account]), worker })
  const models = await adapter.listModels(descriptor.providerId)
  assert.deepEqual(models[0].inputModalities, ['text'])
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

test('a channel that never publishes prices shows all models under free-only', async () => {
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
  const adapter = makeAdapter({
    accounts: makeAccounts([account]),
    worker,
    // Trae CN has no free/paid metadata by design.
    registryDescriptor: { ...descriptor, supportsFreeWindow: false },
  })
  const models = await adapter.listModels(descriptor.providerId)
  assert.deepEqual(models.map((model) => model.id), ['trae-a'])
})

test('a channel expected to publish prices hides unknown models under free-only', async () => {
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
        id: 'unpriced',
        name: 'Unpriced',
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
  assert.deepEqual(models, [])
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

test('adapter fails over to a second account and sticks to it', async () => {
  const calls = []
  const worker = {
    models: makeWorker().models,
    fetch: async (_input, _init, options) => {
      calls.push(options.accountId)
      if (options.accountId === 'acct-1') {
        throw new HitchfinError('token expired', 'AUTH', { status: 401 })
      }
      return sseResponse('from acct-2')
    },
  }
  const adapter = makeAdapter({
    accounts: makeAccounts([account('acct-1'), account('acct-2')]),
    worker,
  })

  const first = await collect(
    adapter.stream({ provider: descriptor.providerId, model: 'free-model', messages: [] }),
  )
  assert.equal(first.find((chunk) => chunk.type === 'text-delta').text, 'from acct-2')
  assert.equal(first.at(-1).type, 'finish')
  assert.equal(first.at(-1).reason.kind, 'stop')
  assert.deepEqual(calls, ['acct-1', 'acct-2'])

  const second = await collect(
    adapter.stream({ provider: descriptor.providerId, model: 'free-model', messages: [] }),
  )
  assert.equal(second.find((chunk) => chunk.type === 'text-delta').text, 'from acct-2')
  assert.deepEqual(calls, ['acct-1', 'acct-2', 'acct-2'])
})

test('adapter refuses while every account is cooling down', async () => {
  let calls = 0
  const worker = {
    models: makeWorker().models,
    fetch: async () => {
      calls += 1
      throw new HitchfinError('token expired', 'AUTH', { status: 401 })
    },
  }
  const adapter = makeAdapter({ accounts: makeAccounts([account('acct-1')]), worker })

  const first = await collect(
    adapter.stream({ provider: descriptor.providerId, model: 'free-model', messages: [] }),
  )
  assert.equal(first.at(-1).reason.kind, 'error')
  assert.equal(first.at(-1).reason.failure.code, 'AUTH')

  const second = await collect(
    adapter.stream({ provider: descriptor.providerId, model: 'free-model', messages: [] }),
  )
  const failure = second.at(-1).reason.failure
  assert.equal(second.at(-1).reason.kind, 'error')
  assert.match(failure.message, /cooling down/)
  assert.ok(failure.providerRetryAfterMs > 0)
  assert.equal(calls, 1)
})

test('adapter does not switch accounts after content has been emitted', async () => {
  const calls = []
  const worker = {
    models: makeWorker().models,
    fetch: async (_input, _init, options) => {
      calls.push(options.accountId)
      return brokenSseResponse('partial text')
    },
  }
  const adapter = makeAdapter({
    accounts: makeAccounts([account('acct-1'), account('acct-2')]),
    worker,
  })

  const chunks = await collect(
    adapter.stream({ provider: descriptor.providerId, model: 'free-model', messages: [] }),
  )
  assert.equal(chunks.find((chunk) => chunk.type === 'text-delta').text, 'partial text')
  assert.equal(chunks.at(-1).type, 'finish')
  assert.equal(chunks.at(-1).reason.kind, 'error')
  assert.deepEqual(calls, ['acct-1'])
})

test('adapter forwards the account proxy for models and chat', async () => {
  const seen = []
  const worker = {
    models: async (options) => {
      seen.push(`models:${options.proxy ?? ''}`)
      return makeWorker().models()
    },
    fetch: async (_input, _init, options) => {
      seen.push(`fetch:${options.proxy ?? ''}`)
      return sseResponse()
    },
  }
  const proxy = 'http://127.0.0.1:7890'
  const adapter = makeAdapter({
    accounts: makeAccounts([account('acct-1', { proxy })]),
    worker,
  })

  await adapter.listModels(descriptor.providerId)
  await collect(
    adapter.stream({ provider: descriptor.providerId, model: 'free-model', messages: [] }),
  )
  assert.deepEqual(seen, [`models:${proxy}`, `fetch:${proxy}`])
})

test('buildOpenAiMessages handles multimodal images and direct toolCallId', () => {
  const messages = [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'what is in this image?' },
        { type: 'image', image: 'abc123base64', mimeType: 'image/jpeg' },
      ],
    },
    {
      role: 'tool',
      toolCallId: 'call_999',
      content: [{ type: 'text', text: 'result text' }],
    },
  ]
  const built = buildOpenAiMessages(messages, 'system prompt')
  assert.equal(built.length, 3)
  assert.deepEqual(built[0], { role: 'system', content: 'system prompt' })
  assert.equal(built[1].role, 'user')
  assert.deepEqual(built[1].content, [
    { type: 'text', text: 'what is in this image?' },
    { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,abc123base64' } },
  ])
  assert.deepEqual(built[2], {
    role: 'tool',
    tool_call_id: 'call_999',
    content: 'result text',
  })
})
