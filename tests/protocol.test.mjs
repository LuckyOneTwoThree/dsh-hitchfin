import './_fresh.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MESSAGES_URL,
  buildAnthropicMessages,
  buildAnthropicRequestBody,
  createAnthropicSseTransport,
} from '../lib/adapter/anthropic-sse.js'
import { CHAT_URL, createOpenAiSseTransport } from '../lib/adapter/openai-sse.js'
import { selectTransportProtocol } from '../lib/adapter/protocol.js'
import { HitchfinAdapter } from '../lib/adapter/hitchfin-adapter.js'
import { normalizeModels, channelUrl } from '../worker/channel-contract.mjs'

const ANTHROPIC_DESCRIPTOR = { protocols: ['openai-completions', 'anthropic-messages'] }
const OPENAI_DESCRIPTOR = { protocols: ['openai-completions'] }

function responseFrom(lines) {
  const body = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      for (const line of lines) controller.enqueue(encoder.encode(line))
      controller.close()
    },
  })
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })
}

function ev(name, data) {
  return `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`
}

function oai(data) {
  return `data: ${data === '[DONE]' ? '[DONE]' : JSON.stringify(data)}\n\n`
}

async function collect(iterable) {
  const chunks = []
  for await (const chunk of iterable) chunks.push(chunk)
  return chunks
}

function params(overrides = {}) {
  return {
    provider: 'hitchfin-workbuddy-cn',
    modelId: 'claude-sonnet-5.5',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    options: {
      provider: 'hitchfin-workbuddy-cn',
      model: 'claude-sonnet-5.5',
      messages: [],
    },
    ...overrides,
  }
}

function fetchWith(response, captured) {
  return async (url, init) => {
    if (captured) {
      captured.push({ url, body: JSON.parse(init.body), headers: init.headers })
    }
    return typeof response === 'function' ? response() : response
  }
}

function anthropicStream() {
  return [
    ev('message_start', {
      type: 'message_start',
      message: { usage: { input_tokens: 10, cache_read_input_tokens: 4, output_tokens: 1 } },
    }),
    ev('content_block_start', {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' },
    }),
    ev('content_block_delta', {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: 'Hello ' },
    }),
    ev('content_block_delta', {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: 'world' },
    }),
    ev('content_block_stop', { type: 'content_block_stop', index: 0 }),
    ev('content_block_start', {
      type: 'content_block_start',
      index: 1,
      content_block: { type: 'thinking', thinking: '' },
    }),
    ev('content_block_delta', {
      type: 'content_block_delta',
      index: 1,
      delta: { type: 'thinking_delta', thinking: 'Let me think' },
    }),
    ev('content_block_stop', { type: 'content_block_stop', index: 1 }),
    ev('content_block_start', {
      type: 'content_block_start',
      index: 2,
      content_block: { type: 'tool_use', id: 'toolu_1', name: 'search', input: {} },
    }),
    ev('content_block_delta', {
      type: 'content_block_delta',
      index: 2,
      delta: { type: 'input_json_delta', partial_json: '{"q":' },
    }),
    ev('content_block_delta', {
      type: 'content_block_delta',
      index: 2,
      delta: { type: 'input_json_delta', partial_json: '"x"}' },
    }),
    ev('content_block_stop', { type: 'content_block_stop', index: 2 }),
    ev('message_delta', {
      type: 'message_delta',
      delta: { stop_reason: 'tool_use' },
      usage: { output_tokens: 7 },
    }),
    ev('message_stop', { type: 'message_stop' }),
  ]
}

// ---------------------------------------------------------------------------
// Protocol selection

test('channel descriptor is a hard gate for the Messages protocol', () => {
  assert.equal(
    selectTransportProtocol(OPENAI_DESCRIPTOR, {
      id: 'claude-sonnet-5.5',
      protocol: 'anthropic-messages',
    }),
    'openai-completions',
  )
})

test('model metadata explicitly selects the Messages protocol', () => {
  assert.equal(
    selectTransportProtocol(ANTHROPIC_DESCRIPTOR, {
      id: 'claude-sonnet-5.5',
      protocol: 'anthropic-messages',
    }),
    'anthropic-messages',
  )
})

test('explicit OpenAI metadata wins over a Claude-shaped model id', () => {
  assert.equal(
    selectTransportProtocol(ANTHROPIC_DESCRIPTOR, {
      id: 'claude-sonnet-5.5',
      protocol: 'openai-completions',
    }),
    'openai-completions',
  )
})

test('missing metadata falls back to the channel package claude- heuristic', () => {
  assert.equal(
    selectTransportProtocol(ANTHROPIC_DESCRIPTOR, { id: 'claude-opus-5' }),
    'anthropic-messages',
  )
  assert.equal(selectTransportProtocol(ANTHROPIC_DESCRIPTOR, { id: 'glm-5.3' }), 'openai-completions')
  assert.equal(selectTransportProtocol(ANTHROPIC_DESCRIPTOR, undefined), 'openai-completions')
})

// ---------------------------------------------------------------------------
// Channel-package contract: catalog normalization and sentinel URL rewriting

test('catalog normalization marks config-layer Messages models', () => {
  const models = normalizeModels({
    'claude-sonnet-5.5': {
      name: 'Claude Sonnet 5.5',
      provider: { npm: '@ai-sdk/anthropic', api: 'https://vendor.example/v1' },
      limit: { context: 200_000 },
      free: false,
    },
    'glm-5.3': { name: 'GLM', provider: { npm: '@ai-sdk/openai-compatible' } },
  })
  assert.equal(models.find((m) => m.id === 'claude-sonnet-5.5').protocol, 'anthropic-messages')
  assert.equal(models.find((m) => m.id === 'glm-5.3').protocol, undefined)
  assert.equal(models.find((m) => m.id === 'claude-sonnet-5.5').contextWindow, 200_000)
})

test('catalog normalization marks live-layer Messages models via api.npm', () => {
  const models = normalizeModels({
    'claude-opus-5': {
      name: 'Claude Opus 5',
      api: { id: 'claude-opus-5', url: 'https://vendor.example/v1', npm: '@ai-sdk/anthropic' },
    },
  })
  assert.equal(models[0].protocol, 'anthropic-messages')
})

test('catalog normalization reads live capabilities.input for modalities', () => {
  const models = normalizeModels({
    'claude-opus-5': {
      name: 'Claude Opus 5',
      api: { id: 'claude-opus-5', url: 'https://vendor.example/v1', npm: '@ai-sdk/anthropic' },
      capabilities: { input: { text: true, image: true, audio: false } },
    },
  })
  assert.deepEqual(models[0].input, ['text', 'image'])
})

test('channelUrl rewrites both sentinel URLs and leaves real URLs alone', () => {
  const loaded = {
    provider: 'workbuddy',
    providerConfig: { api: 'https://copilot.tencent.com/v2' },
  }
  assert.ok(MESSAGES_URL.endsWith('/v1/messages'))
  assert.ok(CHAT_URL.endsWith('/v1/chat/completions'))
  assert.equal(channelUrl(loaded, {}, MESSAGES_URL), 'https://copilot.tencent.com/v1/messages')
  assert.equal(channelUrl(loaded, {}, CHAT_URL), 'https://copilot.tencent.com/v2/chat/completions')
  assert.equal(
    channelUrl(loaded, {}, 'https://real.example/v1/custom'),
    'https://real.example/v1/custom',
  )
  // A package that names the complete Messages endpoint must not get a second
  // `/v1/messages` appended.
  assert.equal(
    channelUrl(
      { provider: 'custom', providerConfig: { api: 'https://api.example.com/v1/messages' } },
      {},
      MESSAGES_URL,
    ),
    'https://api.example.com/v1/messages',
  )
})

// ---------------------------------------------------------------------------
// Anthropic request construction

test('system and developer text are lifted into the top-level system field', () => {
  const mapped = buildAnthropicMessages([
    { role: 'system', content: [{ type: 'text', text: 'You are helpful' }] },
    { role: 'developer', content: [{ type: 'text', text: 'Be brief' }] },
    { role: 'user', content: [{ type: 'text', text: 'hi' }] },
  ])
  assert.equal(mapped.system, 'You are helpful\nBe brief')
  assert.equal(mapped.messages.length, 1)
  assert.equal(mapped.messages[0].role, 'user')
})

test('request body carries max_tokens, tools, thinking and stop sequences', () => {
  const body = buildAnthropicRequestBody(
    params({
      options: {
        provider: 'hitchfin-workbuddy-cn',
        model: 'claude-sonnet-5.5',
        messages: [],
        system: 'sys',
        tools: [{ name: 'search', description: 'd', parameters: { type: 'object' } }],
        maxTokens: 1024,
        reasoningEffort: 'high',
        stop: ['STOP'],
      },
    }),
  )
  assert.equal(body.model, 'claude-sonnet-5.5')
  assert.equal(body.max_tokens, 1024)
  assert.equal(buildAnthropicRequestBody(params()).max_tokens, 4096)
  assert.equal(body.system, 'sys')
  assert.equal(body.stream, true)
  assert.equal(body.tools[0].input_schema.type, 'object')
  assert.equal(body.thinking.type, 'adaptive')
  assert.equal(body.output_config.effort, 'high')
  assert.deepEqual(body.stop_sequences, ['STOP'])
})

test('image content is converted to an Anthropic base64 image source', () => {
  const mapped = buildAnthropicMessages([
    {
      role: 'user',
      content: [
        { type: 'image', image_url: { url: 'data:image/png;base64,AAAA' } },
        { type: 'text', text: 'what is this' },
      ],
    },
  ])
  assert.equal(mapped.messages[0].content[0].type, 'image')
  assert.equal(mapped.messages[0].content[0].source.media_type, 'image/png')
  assert.equal(mapped.messages[0].content[0].source.data, 'AAAA')
})

test('tool calls and tool results map to tool_use and tool_result blocks', () => {
  const mapped = buildAnthropicMessages([
    {
      role: 'assistant',
      content: [
        { type: 'text', text: 'ok' },
        { type: 'tool-call', id: 't1', name: 'search', arguments: '{"q":"x"}' },
      ],
    },
    { role: 'tool', source: { toolCallId: 't1' }, content: [{ type: 'text', text: 'result' }] },
  ])
  assert.equal(mapped.messages[0].content[1].type, 'tool_use')
  assert.equal(mapped.messages[0].content[1].input.q, 'x')
  assert.equal(mapped.messages[1].role, 'user')
  assert.equal(mapped.messages[1].content[0].type, 'tool_result')
  assert.equal(mapped.messages[1].content[0].tool_use_id, 't1')
})

// ---------------------------------------------------------------------------
// Anthropic stream contract

test('Messages stream maps text, thinking, tool_use, usage and finish', async () => {
  const captured = []
  const chunks = await collect(
    createAnthropicSseTransport(fetchWith(() => responseFrom(anthropicStream()), captured))(
      params(),
    ),
  )
  assert.equal(captured[0].url, MESSAGES_URL)
  assert.equal(
    chunks.filter((c) => c.type === 'text-delta').map((c) => c.text).join(''),
    'Hello world',
  )
  assert.equal(
    chunks.filter((c) => c.type === 'reasoning-delta').map((c) => c.text).join(''),
    'Let me think',
  )
  assert.equal(
    chunks.filter((c) => c.type === 'tool-call-delta').map((c) => c.argumentsDelta).join(''),
    '{"q":"x"}',
  )
  const toolEnd = chunks.find((c) => c.type === 'block-end' && c.block.type === 'tool-call')
  assert.equal(toolEnd.block.name, 'search')
  assert.equal(toolEnd.block.arguments, '{"q":"x"}')
  const usage = chunks.find((c) => c.type === 'usage').usage
  assert.equal(usage.inputTokens, 10)
  assert.equal(usage.outputTokens, 7)
  assert.equal(usage.totalTokens, 21)
  assert.equal(usage.cacheReadTokens, 4)
  assert.equal(chunks.at(-1).type, 'finish')
  assert.equal(chunks.at(-1).reason.kind, 'tool-calls')
})

test('Messages stream ends with stop for a plain text answer', async () => {
  const lines = [
    ev('message_start', { type: 'message_start', message: { usage: { input_tokens: 2 } } }),
    ev('content_block_start', {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' },
    }),
    ev('content_block_delta', {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: 'ok' },
    }),
    ev('content_block_stop', { type: 'content_block_stop', index: 0 }),
    ev('message_delta', {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn' },
      usage: { output_tokens: 1 },
    }),
    ev('message_stop', { type: 'message_stop' }),
  ]
  const chunks = await collect(
    createAnthropicSseTransport(fetchWith(() => responseFrom(lines)))(params()),
  )
  assert.equal(chunks.at(-1).reason.kind, 'stop')
})

test('Messages stream reports max_tokens as the finish reason', async () => {
  const lines = [
    ev('message_start', { type: 'message_start' }),
    ev('message_delta', {
      type: 'message_delta',
      delta: { stop_reason: 'max_tokens' },
      usage: { output_tokens: 5 },
    }),
    ev('message_stop', { type: 'message_stop' }),
  ]
  const chunks = await collect(
    createAnthropicSseTransport(fetchWith(() => responseFrom(lines)))(params()),
  )
  assert.equal(chunks.at(-1).reason.kind, 'max-tokens')
})

test('Messages SSE error event is classified as AUTH', async () => {
  const lines = [
    ev('error', {
      type: 'error',
      error: { type: 'authentication_error', message: 'token expired' },
    }),
  ]
  await assert.rejects(
    () =>
      collect(createAnthropicSseTransport(fetchWith(() => responseFrom(lines)))(params())),
    (error) => {
      assert.equal(error.code, 'AUTH')
      assert.match(error.message, /token expired/)
      return true
    },
  )
})

test('a truncated Messages stream still closes open blocks and finishes', async () => {
  const lines = [
    ev('message_start', { type: 'message_start' }),
    ev('content_block_start', {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' },
    }),
    ev('content_block_delta', {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: 'partial' },
    }),
  ]
  const chunks = await collect(
    createAnthropicSseTransport(fetchWith(() => responseFrom(lines)))(params()),
  )
  assert.equal(chunks.find((c) => c.type === 'text-delta').text, 'partial')
  assert.equal(chunks.find((c) => c.type === 'block-end').block.text, 'partial')
  assert.equal(chunks.at(-1).type, 'finish')
})

// ---------------------------------------------------------------------------
// Upstream error classification

test('Messages upstream statuses map to AUTH, MODEL_NOT_FOUND and SERVER', async () => {
  for (const [status, code] of [
    [401, 'AUTH'],
    [404, 'MODEL_NOT_FOUND'],
    [500, 'SERVER'],
  ]) {
    const response = () =>
      new Response('{}', {
        status,
        headers: { 'content-type': 'application/json' },
      })
    await assert.rejects(
      () => collect(createAnthropicSseTransport(fetchWith(response))(params())),
      (error) => {
        assert.equal(error.code, code)
        assert.equal(error.status, status)
        return true
      },
    )
  }
})

test('429 keeps Retry-After as providerRetryAfterMs', async () => {
  const response = () =>
    new Response('{}', {
      status: 429,
      headers: { 'content-type': 'application/json', 'retry-after': '2' },
    })
  await assert.rejects(
    () => collect(createAnthropicSseTransport(fetchWith(response))(params())),
    (error) => {
      assert.equal(error.code, 'RATE_LIMIT')
      assert.equal(error.providerRetryAfterMs, 2000)
      return true
    },
  )
})

test('a JSON body instead of a stream is classified from its error type', async () => {
  const response = () =>
    new Response(
      JSON.stringify({
        type: 'error',
        error: { type: 'rate_limit_error', message: 'slow down' },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  await assert.rejects(
    () => collect(createAnthropicSseTransport(fetchWith(response))(params())),
    (error) => {
      assert.equal(error.code, 'RATE_LIMIT')
      assert.match(error.message, /slow down/)
      return true
    },
  )
})

// ---------------------------------------------------------------------------
// Existing OpenAI-compatible channels stay untouched

test('Qoder-style OpenAI SSE still maps reasoning_content and usage', async () => {
  const lines = [
    oai({ choices: [{ delta: { role: 'assistant', reasoning_content: 'thinking' } }] }),
    oai({
      choices: [{ delta: { content: 'answer' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
    }),
    oai('[DONE]'),
  ]
  const chunks = await collect(
    createOpenAiSseTransport(fetchWith(() => responseFrom(lines)))(params()),
  )
  assert.equal(chunks.find((c) => c.type === 'reasoning-delta').text, 'thinking')
  assert.equal(chunks.find((c) => c.type === 'text-delta').text, 'answer')
  assert.equal(chunks.find((c) => c.type === 'usage').usage.totalTokens, 5)
  assert.equal(chunks.at(-1).reason.kind, 'stop')
})

test('Trae-style stream without usage or finish still completes', async () => {
  const lines = [
    oai({ choices: [{ delta: { content: 'partial' } }] }),
    oai({ error: { message: 'stream closed' } }),
    oai('[DONE]'),
  ]
  const chunks = await collect(
    createOpenAiSseTransport(fetchWith(() => responseFrom(lines)))(params()),
  )
  assert.equal(chunks.find((c) => c.type === 'text-delta').text, 'partial')
  assert.equal(chunks.find((c) => c.type === 'usage').usage.totalTokens, 0)
  assert.equal(chunks.at(-1).reason.kind, 'stop')
})

test('an in-band error before content is surfaced', async () => {
  const lines = [oai({ error: { message: 'rate limited', code: 429 } })]
  await assert.rejects(
    () => collect(createOpenAiSseTransport(fetchWith(() => responseFrom(lines)))(params())),
    (error) => {
      assert.equal(error.code, 'RATE_LIMIT')
      return true
    },
  )
})

test('an empty stream becomes EMPTY_RESPONSE instead of a silent stop', async () => {
  const lines = [
    oai({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
    oai('[DONE]'),
  ]
  await assert.rejects(
    () => collect(createOpenAiSseTransport(fetchWith(() => responseFrom(lines)))(params())),
    (error) => {
      assert.equal(error.code, 'EMPTY_RESPONSE')
      return true
    },
  )
})

test('OpenAI transport keeps its status classification', async () => {
  for (const [status, code] of [
    [401, 'AUTH'],
    [404, 'MODEL_NOT_FOUND'],
  ]) {
    const response = () => new Response('{}', { status })
    await assert.rejects(
      () => collect(createOpenAiSseTransport(fetchWith(response))(params())),
      (error) => {
        assert.equal(error.code, code)
        return true
      },
    )
  }
})

// ---------------------------------------------------------------------------
// Adapter-level routing: the descriptor + catalog metadata actually drive the wire

function descriptorWithProtocols() {
  return {
    id: 'workbuddy-cn',
    providerId: 'hitchfin-workbuddy-cn',
    packageProvider: 'workbuddy',
    displayName: 'WorkBuddy CN',
    status: 'stable',
    protocols: ['openai-completions', 'anthropic-messages'],
    authMethods: [],
    freeOnlyDefault: false,
    supportsFreeWindow: true,
    packageName: 'mock',
    packageVersion: '0.0.0',
    exportName: 'Mock',
    fallbackPath: '/tmp/mock.mjs',
  }
}

function adapterHarness(models, streamLines) {
  const calls = []
  const descriptor = descriptorWithProtocols()
  const worker = {
    models: async () => models,
    fetch: async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body), headers: init.headers })
      return responseFrom(streamLines)
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
    accounts: {
      list: async () => [
        {
          channelId: 'workbuddy-cn',
          accountId: 'acct-1',
          label: 'mock',
          auth: { type: 'oauth', access: 'token' },
          freeOnly: false,
          createdAt: 0,
          updatedAt: 0,
        },
      ],
    },
    worker,
    logger: { info() {}, warn() {}, error() {} },
  })
  return { adapter, calls, descriptor }
}

function generateOptions(model) {
  return {
    provider: 'hitchfin-workbuddy-cn',
    model,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    sessionId: 'session-1',
  }
}

test('adapter sends a Messages request for a catalog-marked Claude model', async () => {
  const { adapter, calls } = adapterHarness(
    [
      {
        id: 'claude-sonnet-5.5',
        name: 'Claude Sonnet 5.5',
        input: ['text'],
        efforts: [],
        free: false,
        freeKnown: true,
        protocol: 'anthropic-messages',
      },
    ],
    anthropicStream(),
  )
  const chunks = await collect(adapter.stream(generateOptions('claude-sonnet-5.5')))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, MESSAGES_URL)
  assert.equal(calls[0].body.stream, true)
  assert.equal(calls[0].body.max_tokens, 4096)
  assert.ok(Array.isArray(calls[0].body.messages))
  assert.equal(chunks.at(-1).type, 'finish')
})

test('adapter keeps chat completions for a non-Claude model on the same channel', async () => {
  const { adapter, calls } = adapterHarness(
    [
      {
        id: 'glm-5.3',
        name: 'GLM 5.3',
        input: ['text'],
        efforts: [],
        free: false,
        freeKnown: true,
      },
    ],
    [
      oai({ choices: [{ delta: { content: 'answer' }, finish_reason: 'stop' }] }),
      oai('[DONE]'),
    ],
  )
  const chunks = await collect(adapter.stream(generateOptions('glm-5.3')))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, CHAT_URL)
  assert.equal(calls[0].body.model, 'glm-5.3')
  assert.equal(calls[0].body.stream, true)
  assert.equal(chunks.at(-1).type, 'finish')
})

function streamWithoutClose(lines) {
  const body = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      for (const line of lines) controller.enqueue(encoder.encode(line))
      // Deliberately no close(): the protocol terminator must end the turn.
    },
  })
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

function withDeadline(promise, ms, label) {
  let timer
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out: ${label}`)), ms)
    timer.unref?.()
  })
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer))
}

test('OpenAI stream ends at [DONE] without waiting for the socket to close', async () => {
  const transport = createOpenAiSseTransport(
    fetchWith(
      streamWithoutClose([
        oai({ choices: [{ delta: { content: 'hi' } }] }),
        oai('[DONE]'),
      ]),
    ),
  )
  const chunks = await withDeadline(
    collect(transport(params())),
    2_000,
    'OpenAI [DONE] terminator',
  )
  assert.equal(chunks.at(-1).type, 'finish')
  assert.equal(chunks.at(-1).reason.kind, 'stop')
})

test('Messages stream ends at message_stop without waiting for the socket to close', async () => {
  const transport = createAnthropicSseTransport(
    fetchWith(
      streamWithoutClose([
        ev('message_start', {
          type: 'message_start',
          message: { usage: { input_tokens: 1 } },
        }),
        ev('content_block_start', {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: '' },
        }),
        ev('content_block_delta', {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'hi' },
        }),
        ev('content_block_stop', { type: 'content_block_stop', index: 0 }),
        ev('message_delta', {
          type: 'message_delta',
          delta: { stop_reason: 'end_turn' },
          usage: { output_tokens: 1 },
        }),
        ev('message_stop', { type: 'message_stop' }),
      ]),
    ),
  )
  const chunks = await withDeadline(
    collect(transport(params())),
    2_000,
    'Messages message_stop terminator',
  )
  assert.equal(chunks.at(-1).type, 'finish')
  assert.equal(chunks.at(-1).reason.kind, 'stop')
})

test('a trailing rate-limit error after content is still reported', async () => {
  const transport = createOpenAiSseTransport(
    fetchWith(
      responseFrom([
        oai({ choices: [{ delta: { content: 'partial answer' } }] }),
        oai({ error: { message: 'rate limited', code: 429 } }),
      ]),
    ),
  )
  await assert.rejects(
    collect(transport(params())),
    (error) => error.code === 'RATE_LIMIT',
  )
})

test('a generic trailing error object still lets streamed content finish', async () => {
  const transport = createOpenAiSseTransport(
    fetchWith(
      responseFrom([
        oai({ choices: [{ delta: { content: 'answer' }, finish_reason: 'stop' }] }),
        oai({ error: { message: 'vendor closed the turn' } }),
      ]),
    ),
  )
  const chunks = await collect(transport(params()))
  assert.equal(chunks.at(-1).type, 'finish')
  assert.equal(chunks.at(-1).reason.kind, 'stop')
})
