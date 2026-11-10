import { HitchfinError } from '../errors.js'
import type {
  RequestContentBlock,
  RequestMessage,
  StreamChunk,
  TokenUsage,
} from '../types.js'
import {
  failureForStatus,
  parseRetryAfterMs,
  type ChannelFetch,
  type OpenAiSseParams,
} from './openai-sse.js'

/**
 * Sentinel URL for the Anthropic Messages protocol. The worker rewrites it to
 * <endpoint>/v1/messages; the channel package's fetch uses the URL path to
 * decide whether the request is a native Messages call.
 */
export const MESSAGES_URL = 'http://hitchfin.local/v1/messages'

const DEFAULT_MAX_TOKENS = 4096

type Block = Record<string, unknown>
type Message = { role: 'user' | 'assistant'; content: Block[] }

function imageSource(block: Record<string, unknown>): Block | null {
  let url: unknown
  if (block.image_url && typeof block.image_url === 'object') {
    url = (block.image_url as Record<string, unknown>).url
  } else if (typeof block.url === 'string') {
    url = block.url
  }

  if (typeof url === 'string') {
    const match = /^data:([^;,]+);base64,(.*)$/s.exec(url)
    if (match) {
      return {
        type: 'image',
        source: { type: 'base64', media_type: match[1], data: match[2] },
      }
    }
    return { type: 'image', source: { type: 'url', url } }
  }

  if (typeof block.image === 'string') {
    const mime = typeof block.mimeType === 'string' ? block.mimeType : 'image/png'
    const data = block.image.startsWith('data:')
      ? /^data:[^;,]+;base64,(.*)$/s.exec(block.image)?.[1] ?? ''
      : block.image
    if (data) {
      return {
        type: 'image',
        source: { type: 'base64', media_type: mime, data },
      }
    }
  }

  const source = block.source
  if (source && typeof source === 'object' && !Array.isArray(source)) {
    const src = source as Record<string, unknown>
    if (src.type === 'base64' && typeof src.data === 'string') {
      return {
        type: 'image',
        source: {
          type: 'base64',
          media_type: typeof src.media_type === 'string' ? src.media_type : 'image/png',
          data: src.data,
        },
      }
    }
    if (src.type === 'url' && typeof src.url === 'string') {
      return { type: 'image', source: { type: 'url', url: src.url } }
    }
  }
  return null
}

function toolCallInput(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // A partially streamed tool call may not be valid JSON in history.
  }
  return {}
}

/**
 * Map DSH messages onto the Anthropic Messages shape. System/developer text is
 * lifted out of `messages`; tool results become user-side tool_result blocks.
 * Historical reasoning blocks are omitted: a thinking block without a valid
 * signature is stripped by the channel package anyway.
 */
export function buildAnthropicMessages(
  messages: readonly RequestMessage[],
  system?: string,
): { system?: string; messages: Message[] } {
  const out: Message[] = []
  const systemParts: string[] = []
  if (typeof system === 'string' && system.length > 0) systemParts.push(system)

  let pendingToolResults: Block[] = []
  const flushToolResults = (): void => {
    if (pendingToolResults.length === 0) return
    out.push({ role: 'user', content: pendingToolResults })
    pendingToolResults = []
  }

  for (const msg of messages) {
    if (msg.role === 'system' || msg.role === 'developer') {
      flushToolResults()
      const text = textOnly(msg.content)
      if (text) systemParts.push(text)
      continue
    }

    if (msg.role === 'tool') {
      const toolCallId =
        (msg.source && typeof msg.source.toolCallId === 'string' ? msg.source.toolCallId : '') ||
        (typeof msg.toolCallId === 'string' ? msg.toolCallId : '') ||
        (typeof (msg as Record<string, unknown>).tool_call_id === 'string'
          ? ((msg as Record<string, unknown>).tool_call_id as string)
          : '')
      pendingToolResults.push({
        type: 'tool_result',
        tool_use_id: toolCallId,
        content: textOnly(msg.content),
      })
      continue
    }

    flushToolResults()

    if (msg.role === 'user') {
      const content: Block[] = []
      for (const block of msg.content) {
        if (block.type === 'text' && typeof block.text === 'string') {
          content.push({ type: 'text', text: block.text })
        } else if (block.type === 'image' || block.type === 'image_url') {
          const image = imageSource(block as Record<string, unknown>)
          if (image) content.push(image)
        }
      }
      if (content.length === 0) content.push({ type: 'text', text: textOnly(msg.content) })
      out.push({ role: 'user', content })
      continue
    }

    if (msg.role === 'assistant') {
      const content: Block[] = []
      const textParts: string[] = []
      for (const block of msg.content) {
        if (block.type === 'text' && typeof block.text === 'string') {
          textParts.push(block.text)
        } else if (
          block.type === 'tool-call' &&
          typeof block.name === 'string' &&
          typeof block.arguments === 'string'
        ) {
          if (textParts.length > 0) {
            content.push({ type: 'text', text: textParts.splice(0).join('') })
          }
          content.push({
            type: 'tool_use',
            id: String(block.id ?? ''),
            name: block.name,
            input: toolCallInput(block.arguments),
          })
        }
      }
      if (textParts.length > 0) content.push({ type: 'text', text: textParts.join('') })
      if (content.length > 0) out.push({ role: 'assistant', content })
    }
  }
  flushToolResults()

  return {
    ...(systemParts.length > 0 ? { system: systemParts.join('\n') } : {}),
    messages: out,
  }
}

function textOnly(content: readonly RequestContentBlock[]): string {
  const parts: string[] = []
  for (const block of content) {
    if (block.type === 'text' && typeof block.text === 'string') parts.push(block.text)
  }
  return parts.join('\n')
}

export function buildAnthropicRequestBody(params: OpenAiSseParams): Record<string, unknown> {
  const { modelId, messages, options } = params
  const mapped = buildAnthropicMessages(messages, options.system)
  const body: Record<string, unknown> = {
    model: modelId,
    max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
    messages: mapped.messages,
    stream: true,
  }
  if (mapped.system) body.system = mapped.system
  if (options.tools && options.tools.length > 0) {
    body.tools = options.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    }))
  }
  if (options.temperature !== undefined) body.temperature = options.temperature
  if (options.stop && options.stop.length > 0) body.stop_sequences = [...options.stop]
  if (options.reasoningEffort !== undefined) {
    body.thinking = { type: 'adaptive' }
    body.output_config = { effort: String(options.reasoningEffort) }
  }
  return body
}

interface AnthropicBlockState {
  kind: 'text' | 'reasoning' | 'tool-call'
  chunkIndex: number
  text: string
  id: string
  name: string
  args: string
}

interface AnthropicEvent {
  type?: string
  index?: number
  content_block?: { type?: string; id?: string; name?: string; input?: unknown; text?: string }
  delta?: {
    type?: string
    text?: string
    thinking?: string
    partial_json?: string
    stop_reason?: string
  }
  message?: {
    usage?: {
      input_tokens?: number
      cache_read_input_tokens?: number
      cache_creation_input_tokens?: number
    }
  }
  usage?: { output_tokens?: number }
  error?: { type?: string; message?: string; code?: unknown }
}

function errorCodeFor(eventType: string | undefined, status?: number): string {
  if (status === 401 || status === 403 || eventType === 'authentication_error') return 'AUTH'
  if (status === 402 || eventType === 'quota_exceeded') return 'QUOTA'
  if (status === 429 || eventType === 'rate_limit_error') return 'RATE_LIMIT'
  if (status === 404 || eventType === 'not_found_error') return 'MODEL_NOT_FOUND'
  if (eventType === 'invalid_request_error') return 'INVALID_REQUEST'
  return 'SERVER'
}

async function responseDetail(response: Response): Promise<string> {
  try {
    const text = await response.text()
    if (!text) return ''
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string }; message?: string }
      const message = parsed.error?.message ?? parsed.message
      return `: ${message ?? text.slice(0, 300)}`
    } catch {
      return `: ${text.slice(0, 300)}`
    }
  } catch {
    return ''
  }
}

export function createAnthropicSseTransport(
  fetchImpl: ChannelFetch,
): (params: OpenAiSseParams) => AsyncGenerator<StreamChunk, void, unknown> {
  return async function* anthropicSseTransport(params) {
    const requestBody = buildAnthropicRequestBody(params)
    const response = await fetchImpl(MESSAGES_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'text/event-stream',
      },
      body: JSON.stringify(requestBody),
      ...(params.signal ? { signal: params.signal } : {}),
    })

    if (!response.ok) {
      const error = failureForStatus(response.status, await responseDetail(response))
      const retryAfter = parseRetryAfterMs(response.headers.get('retry-after'))
      // The provider's wait applies to whatever it just rejected, not only 429.
      if (retryAfter !== undefined) {
        throw new HitchfinError(error.message, error.code, {
          status: error.status,
          providerRetryAfterMs: retryAfter,
        })
      }
      throw error
    }

    if (!response.body) {
      throw new HitchfinError('channel returned an empty response body', 'TRANSPORT')
    }

    const contentType = response.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      const text = await response.text()
      let message = text.slice(0, 300)
      let eventType = ''
      try {
        const parsed = JSON.parse(text) as AnthropicEvent
        eventType = parsed.error?.type ?? ''
        message = parsed.error?.message ?? message
      } catch {
        // The body is diagnostic only.
      }
      const code = errorCodeFor(eventType, response.status)
      throw new HitchfinError(`channel returned JSON instead of a stream: ${message}`, code, {
        status: response.status,
      })
    }

    const blocks = new Map<number, AnthropicBlockState>()
    let nextBlockIndex = 0
    let inputTokens = 0
    let outputTokens = 0
    let cacheReadTokens = 0
    let cacheWriteTokens = 0
    let finishReasonKind: 'stop' | 'tool-calls' | 'max-tokens' = 'stop'

    const closeBlock = function* (index: number): Generator<StreamChunk, void, unknown> {
      const state = blocks.get(index)
      if (!state) return
      blocks.delete(index)
      if (state.kind === 'text') {
        yield { type: 'block-end', index: state.chunkIndex, block: { type: 'text', text: state.text } }
      } else if (state.kind === 'reasoning') {
        yield {
          type: 'block-end',
          index: state.chunkIndex,
          block: { type: 'reasoning', text: state.text },
        }
      } else {
        yield {
          type: 'block-end',
          index: state.chunkIndex,
          block: {
            type: 'tool-call',
            id: state.id || `call_${state.chunkIndex}`,
            name: state.name || 'unknown_tool',
            arguments: state.args || '{}',
          },
        }
        finishReasonKind = 'tool-calls'
      }
    }

    const processEvent = function* (payload: string): Generator<StreamChunk, boolean, unknown> {
      const trimmed = payload.trim()
      if (!trimmed) return false
      // message_stop is the protocol's own terminator; [DONE] is accepted too.
      if (trimmed === '[DONE]') return true
      let event: AnthropicEvent
      try {
        event = JSON.parse(trimmed) as AnthropicEvent
      } catch {
        return false
      }

      switch (event.type) {
        case 'message_start': {
          const usage = event.message?.usage
          if (usage) {
            inputTokens = usage.input_tokens ?? inputTokens
            cacheReadTokens = usage.cache_read_input_tokens ?? cacheReadTokens
            cacheWriteTokens = usage.cache_creation_input_tokens ?? cacheWriteTokens
          }
          return false
        }
        case 'content_block_start': {
          const index = event.index ?? 0
          const rawType = event.content_block?.type
          const kind: AnthropicBlockState['kind'] =
            rawType === 'thinking' || rawType === 'redacted_thinking'
              ? 'reasoning'
              : rawType === 'tool_use'
                ? 'tool-call'
                : 'text'
          const state: AnthropicBlockState = {
            kind,
            chunkIndex: nextBlockIndex++,
            text: '',
            id: event.content_block?.id ?? '',
            name: event.content_block?.name ?? '',
            args: '',
          }
          blocks.set(index, state)
          yield {
            type: 'block-start',
            index: state.chunkIndex,
            blockType: kind === 'tool-call' ? 'tool-call' : kind,
          }
          if (kind === 'tool-call') {
            yield {
              type: 'tool-call-delta',
              index: state.chunkIndex,
              id: state.id || `call_${state.chunkIndex}`,
              ...(state.name ? { name: state.name } : {}),
              argumentsDelta: '',
            }
          } else if (rawType === 'text' && typeof event.content_block?.text === 'string') {
            state.text += event.content_block.text
            if (event.content_block.text.length > 0) {
              yield {
                type: 'text-delta',
                index: state.chunkIndex,
                text: event.content_block.text,
              }
            }
          }
          return false
        }
        case 'content_block_delta': {
          const index = event.index ?? 0
          const state = blocks.get(index)
          if (!state) return false
          const delta = event.delta
          const text = delta?.text ?? ''
          const thinking = delta?.thinking ?? ''
          const partialJson = delta?.partial_json ?? ''
          if (state.kind === 'text' && text) {
            state.text += text
            yield { type: 'text-delta', index: state.chunkIndex, text }
          } else if (state.kind === 'reasoning' && thinking) {
            state.text += thinking
            yield { type: 'reasoning-delta', index: state.chunkIndex, text: thinking }
          } else if (state.kind === 'tool-call' && partialJson) {
            state.args += partialJson
            yield {
              type: 'tool-call-delta',
              index: state.chunkIndex,
              id: state.id || `call_${state.chunkIndex}`,
              ...(state.name ? { name: state.name } : {}),
              argumentsDelta: partialJson,
            }
          }
          return false
        }
        case 'content_block_stop': {
          yield* closeBlock(event.index ?? 0)
          return false
        }
        case 'message_delta': {
          if (event.usage?.output_tokens !== undefined) outputTokens = event.usage.output_tokens
          const stopReason = event.delta?.stop_reason
          if (stopReason === 'max_tokens') finishReasonKind = 'max-tokens'
          else if (stopReason === 'tool_use') finishReasonKind = 'tool-calls'
          return false
        }
        case 'message_stop':
          return true
        case 'error': {
          const code = errorCodeFor(event.error?.type)
          throw new HitchfinError(
            `channel stream error: ${event.error?.message ?? 'unknown error'}`,
            code,
          )
        }
        default:
          return false
      }
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    try {
      // message_stop ends the turn on its own: waiting for TCP EOF hangs the
      // request whenever the vendor keeps the connection open.
      readLoop: while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let newlineIdx = buffer.indexOf('\n')
        while (newlineIdx !== -1) {
          const rawLine = buffer.slice(0, newlineIdx).replace(/\r$/, '')
          buffer = buffer.slice(newlineIdx + 1)
          if (rawLine.startsWith('data:')) {
            if (yield* processEvent(rawLine.slice(5))) break readLoop
          }
          newlineIdx = buffer.indexOf('\n')
        }
      }
      if (buffer.trim().length > 0) {
        for (const line of buffer.split(/\r?\n/)) {
          if (line.startsWith('data:')) yield* processEvent(line.slice(5))
        }
      }
    } finally {
      await reader.cancel().catch(() => {})
    }

    for (const index of [...blocks.keys()]) yield* closeBlock(index)

    // A normal stop with no content block is the degenerate completion the
    // host recognizes as retryable. A max-token stop may legitimately carry
    // no text, matching the host's own Messages adapter.
    if (nextBlockIndex === 0 && finishReasonKind === 'stop') {
      throw new HitchfinError('channel returned an empty response', 'EMPTY_RESPONSE')
    }

    const usage: TokenUsage = {
      inputTokens: Math.max(0, inputTokens),
      outputTokens: Math.max(0, outputTokens),
      totalTokens: Math.max(
        0,
        inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens,
      ),
      ...(cacheReadTokens > 0 ? { cacheReadTokens } : {}),
      ...(cacheWriteTokens > 0 ? { cacheWriteTokens } : {}),
    }
    yield { type: 'usage', usage }
    yield { type: 'finish', reason: { kind: finishReasonKind } }
  }
}
