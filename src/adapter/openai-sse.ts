import { HitchfinError } from '../errors.js'
import type {
  GenerateOptions,
  RequestContentBlock,
  RequestMessage,
  StreamChunk,
  TokenUsage,
} from '../types.js'

export const CHAT_URL = 'http://hitchfin.local/v1/chat/completions'

export type ChannelFetch = (input: string, init: RequestInit) => Promise<Response>

export interface OpenAiSseParams {
  provider: string
  modelId: string
  messages: readonly RequestMessage[]
  options: GenerateOptions
  signal?: AbortSignal
  sessionId?: string
}

function flattenContentToText(content: readonly RequestContentBlock[]): string {
  const parts: string[] = []
  for (const block of content) {
    if (block.type === 'text' && typeof block.text === 'string') {
      parts.push(block.text)
    }
  }
  return parts.join('\n')
}

export function buildOpenAiMessages(
  messages: readonly RequestMessage[],
  system?: string,
): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = []

  if (typeof system === 'string' && system.length > 0) {
    out.push({ role: 'system', content: system })
  }

  for (const msg of messages) {
    switch (msg.role) {
      case 'system':
      case 'developer': {
        const text = flattenContentToText(msg.content)
        if (text.length > 0) {
          out.push({ role: msg.role === 'developer' ? 'developer' : 'system', content: text })
        }
        break
      }
      case 'user': {
        const parts: Array<Record<string, unknown>> = []
        for (const block of msg.content) {
          if (block.type === 'text' && typeof block.text === 'string') {
            parts.push({ type: 'text', text: block.text })
          } else if (block.type === 'image' || block.type === 'image_url') {
            const record = block as Record<string, unknown>
            if (record.image_url && typeof record.image_url === 'object') {
              parts.push({ type: 'image_url', image_url: record.image_url })
            } else if (typeof record.url === 'string') {
              parts.push({ type: 'image_url', image_url: { url: record.url } })
            } else if (typeof record.image === 'string') {
              const mime = typeof record.mimeType === 'string' ? record.mimeType : 'image/png'
              const url = record.image.startsWith('data:')
                ? record.image
                : `data:${mime};base64,${record.image}`
              parts.push({ type: 'image_url', image_url: { url } })
            } else if (record.source && typeof record.source === 'object') {
              const src = record.source as Record<string, unknown>
              if (src.type === 'base64' && typeof src.data === 'string') {
                const mime = typeof src.media_type === 'string' ? src.media_type : 'image/png'
                parts.push({ type: 'image_url', image_url: { url: `data:${mime};base64,${src.data}` } })
              }
            }
          }
        }
        const hasImages = parts.some((part) => part.type === 'image_url')
        if (hasImages) {
          out.push({ role: 'user', content: parts })
        } else {
          out.push({ role: 'user', content: flattenContentToText(msg.content) })
        }
        break
      }
      case 'assistant': {
        const textParts: string[] = []
        const reasoningParts: string[] = []
        const toolCalls: Array<Record<string, unknown>> = []

        for (const block of msg.content) {
          if (block.type === 'text' && typeof block.text === 'string') {
            textParts.push(block.text)
          } else if (block.type === 'reasoning' && typeof block.text === 'string') {
            reasoningParts.push(block.text)
          } else if (
            block.type === 'tool-call' &&
            typeof block.name === 'string' &&
            typeof block.arguments === 'string'
          ) {
            toolCalls.push({
              id: String(block.id),
              type: 'function',
              function: { name: block.name, arguments: block.arguments },
            })
          }
        }

        const assistantEntry: Record<string, unknown> = {
          role: 'assistant',
          content: textParts.length > 0 ? textParts.join('') : null,
        }
        if (reasoningParts.length > 0) {
          assistantEntry.reasoning_content = reasoningParts.join('')
        }
        if (toolCalls.length > 0) {
          assistantEntry.tool_calls = toolCalls
        }
        out.push(assistantEntry)
        break
      }
      case 'tool': {
        const toolCallId =
          (msg.source && typeof msg.source === 'object' && typeof msg.source.toolCallId === 'string'
            ? msg.source.toolCallId
            : undefined) ??
          (typeof msg.toolCallId === 'string' ? msg.toolCallId : undefined) ??
          (typeof (msg as Record<string, unknown>).tool_call_id === 'string'
            ? ((msg as Record<string, unknown>).tool_call_id as string)
            : '')
        out.push({
          role: 'tool',
          tool_call_id: toolCallId,
          content: flattenContentToText(msg.content),
        })
        break
      }
    }
  }

  return out
}

export function parseRetryAfterMs(headerValue: string | null): number | undefined {
  if (!headerValue) return undefined
  const trimmed = headerValue.trim()
  const seconds = Number(trimmed)
  if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds * 1000)
  const dateMs = Date.parse(trimmed)
  if (Number.isFinite(dateMs)) {
    const delta = dateMs - Date.now()
    if (delta > 0) return delta
  }
  return undefined
}

interface OpenAiSseDeltaToolCall {
  index?: number
  id?: string
  type?: string
  function?: {
    name?: string
    arguments?: string
  }
}

interface OpenAiSseChunkPayload {
  id?: string
  model?: string
  choices?: Array<{
    index?: number
    delta?: {
      role?: string
      content?: string | null
      reasoning_content?: string | null
      reasoning?: string | null
      tool_calls?: OpenAiSseDeltaToolCall[]
    }
    finish_reason?: string | null
  }>
  error?: { message?: string; code?: unknown; type?: unknown } | string
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
    prompt_tokens_details?: { cached_tokens?: number }
    completion_tokens_details?: { reasoning_tokens?: number }
  }
}

export function failureForStatus(status: number, detail: string): HitchfinError {
  if (status === 401 || status === 403) {
    return new HitchfinError(`channel authentication failed (${status})${detail}`, 'AUTH', { status })
  }
  if (status === 402) {
    return new HitchfinError(`channel quota exhausted (402)${detail}`, 'QUOTA', { status })
  }
  if (status === 429) {
    return new HitchfinError(`channel rate limit (429)${detail}`, 'RATE_LIMIT', { status })
  }
  if (status >= 500) {
    return new HitchfinError(`channel server error (${status})${detail}`, 'SERVER', { status })
  }
  if (status === 404) {
    return new HitchfinError(`channel model or route not found (404)${detail}`, 'MODEL_NOT_FOUND', {
      status,
    })
  }
  return new HitchfinError(`channel request rejected (${status})${detail}`, 'INVALID_REQUEST', {
    status,
  })
}

export function createOpenAiSseTransport(
  fetchImpl: ChannelFetch,
): (params: OpenAiSseParams) => AsyncGenerator<StreamChunk, void, unknown> {
  return async function* openAiSseTransport(params) {
    const { modelId, messages, options, signal } = params

    const requestBody: Record<string, unknown> = {
      model: modelId,
      messages: buildOpenAiMessages(messages, options.system),
      stream: true,
      stream_options: { include_usage: true },
    }

    if (options.tools && options.tools.length > 0) {
      requestBody.tools = options.tools.map((tool) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }))
    }
    if (options.reasoningEffort !== undefined) {
      requestBody.reasoning_effort = String(options.reasoningEffort)
    }
    if (options.temperature !== undefined) requestBody.temperature = options.temperature
    if (options.maxTokens !== undefined) requestBody.max_tokens = options.maxTokens
    if (options.stop !== undefined && options.stop.length > 0) requestBody.stop = options.stop

    const response = await fetchImpl(CHAT_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'text/event-stream',
      },
      body: JSON.stringify(requestBody),
      ...(signal ? { signal } : {}),
    })

    if (!response.ok) {
      let detail = ''
      try {
        const text = await response.text()
        if (text) {
          try {
            const parsed = JSON.parse(text) as { error?: { message?: string } }
            if (parsed.error?.message) {
              detail = `: ${parsed.error.message}`
            } else {
              detail = `: ${text.slice(0, 300)}`
            }
          } catch {
            detail = `: ${text.slice(0, 300)}`
          }
        }
      } catch {
        // The body is diagnostic only.
      }
      const error = failureForStatus(response.status, detail)
      const retryAfter = parseRetryAfterMs(response.headers.get('retry-after'))
      if (retryAfter !== undefined && error.code === 'RATE_LIMIT') {
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
      let msg = text.slice(0, 300)
      let code = 'SERVER'
      try {
        const parsed = JSON.parse(text) as Record<string, unknown>
        const errObj = parsed.error as Record<string, unknown> | undefined
        if (typeof errObj?.message === 'string') msg = errObj.message
        else if (typeof parsed.msg === 'string') msg = parsed.msg
        else if (typeof parsed.message === 'string') msg = parsed.message

        if (errObj?.code === 401 || errObj?.code === 'AUTH' || parsed.code === 401) {
          code = 'AUTH'
        }
      } catch {}
      throw new HitchfinError(`channel returned JSON instead of a stream: ${msg}`, code, {
        status: response.status,
      })
    }

    let nextBlockIndex = 0
    let activeStreamBlock:
      | { kind: 'reasoning'; index: number; text: string }
      | { kind: 'text'; index: number; text: string }
      | null = null

    const toolCallMap = new Map<
      number,
      { blockIndex: number; id: string; name: string; args: string }
    >()

    let latestUsage: TokenUsage | null = null
    let finishReasonKind: 'stop' | 'tool-calls' | 'max-tokens' = 'stop'
    let sawVisible = false

    const closeActiveStreamBlock = function* (): Generator<StreamChunk, void, unknown> {
      if (!activeStreamBlock) return
      if (activeStreamBlock.kind === 'reasoning') {
        yield {
          type: 'block-end',
          index: activeStreamBlock.index,
          block: { type: 'reasoning', text: activeStreamBlock.text },
        }
      } else {
        yield {
          type: 'block-end',
          index: activeStreamBlock.index,
          block: { type: 'text', text: activeStreamBlock.text },
        }
      }
      activeStreamBlock = null
    }

    const processSseDataLine = function* (dataPayload: string): Generator<StreamChunk, boolean, unknown> {
      const trimmed = dataPayload.trim()
      if (!trimmed) return false
      if (trimmed === '[DONE]') return true

      let parsed: OpenAiSseChunkPayload
      try {
        parsed = JSON.parse(trimmed) as OpenAiSseChunkPayload
      } catch {
        return false
      }

      // A vendor that closes an otherwise healthy stream with a trailing error
      // object (Trae does) must not turn already-streamed content into a
      // failure; an error before any content is a real failure.
      if (parsed.error !== undefined && parsed.error !== null && !sawVisible) {
        const message =
          typeof parsed.error === 'string'
            ? parsed.error
            : typeof parsed.error.message === 'string'
              ? parsed.error.message
              : 'unknown error'
        const status =
          typeof parsed.error === 'object' && typeof parsed.error.code === 'number'
            ? parsed.error.code
            : 500
        throw failureForStatus(status, `: ${message}`)
      }

      if (parsed.usage) {
        const promptTokens = parsed.usage.prompt_tokens ?? 0
        const completionTokens = parsed.usage.completion_tokens ?? 0
        const cachedTokens = parsed.usage.prompt_tokens_details?.cached_tokens ?? 0
        const reasoningTokens = parsed.usage.completion_tokens_details?.reasoning_tokens ?? 0
        latestUsage = {
          inputTokens: Math.max(0, promptTokens - cachedTokens),
          outputTokens: completionTokens,
          totalTokens: parsed.usage.total_tokens ?? promptTokens + completionTokens,
          ...(cachedTokens > 0 ? { cacheReadTokens: cachedTokens } : {}),
          ...(reasoningTokens > 0 ? { reasoningTokens } : {}),
        }
      }

      const choice = parsed.choices?.[0]
      if (!choice) return false
      const delta = choice.delta

      if (delta) {
        const reasoningDelta =
          typeof delta.reasoning_content === 'string'
            ? delta.reasoning_content
            : typeof delta.reasoning === 'string'
              ? delta.reasoning
              : ''

        if (reasoningDelta.length > 0) {
          sawVisible = true
          if (activeStreamBlock && activeStreamBlock.kind !== 'reasoning') {
            yield* closeActiveStreamBlock()
          }
          if (!activeStreamBlock) {
            const idx = nextBlockIndex++
            activeStreamBlock = { kind: 'reasoning', index: idx, text: '' }
            yield { type: 'block-start', index: idx, blockType: 'reasoning' }
          }
          activeStreamBlock.text += reasoningDelta
          yield { type: 'reasoning-delta', index: activeStreamBlock.index, text: reasoningDelta }
        }

        if (typeof delta.content === 'string' && delta.content.length > 0) {
          sawVisible = true
          if (activeStreamBlock && activeStreamBlock.kind !== 'text') {
            yield* closeActiveStreamBlock()
          }
          if (!activeStreamBlock) {
            const idx = nextBlockIndex++
            activeStreamBlock = { kind: 'text', index: idx, text: '' }
            yield { type: 'block-start', index: idx, blockType: 'text' }
          }
          activeStreamBlock.text += delta.content
          yield { type: 'text-delta', index: activeStreamBlock.index, text: delta.content }
        }

        if (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0) {
          sawVisible = true
          yield* closeActiveStreamBlock()
          for (const toolCall of delta.tool_calls) {
            const tcIndex = toolCall.index ?? 0
            let state = toolCallMap.get(tcIndex)
            if (!state) {
              const blockIndex = nextBlockIndex++
              const initialId =
                toolCall.id && toolCall.id.length > 0
                  ? toolCall.id
                  : `call_${blockIndex}_${tcIndex}`
              state = {
                blockIndex,
                id: initialId,
                name: toolCall.function?.name ?? '',
                args: '',
              }
              toolCallMap.set(tcIndex, state)
              yield { type: 'block-start', index: blockIndex, blockType: 'tool-call' }
            } else {
              if (toolCall.id && toolCall.id.length > 0) state.id = toolCall.id
              if (toolCall.function?.name && toolCall.function.name.length > 0) {
                state.name = toolCall.function.name
              }
            }

            const argsDelta = toolCall.function?.arguments ?? ''
            state.args += argsDelta
            yield {
              type: 'tool-call-delta',
              index: state.blockIndex,
              id: state.id,
              ...(state.name.length > 0 ? { name: state.name } : {}),
              argumentsDelta: argsDelta,
            }
          }
        }
      }

      if (choice.finish_reason) {
        if (choice.finish_reason === 'tool_calls' || choice.finish_reason === 'function_call') {
          finishReasonKind = 'tool-calls'
        } else if (choice.finish_reason === 'length') {
          finishReasonKind = 'max-tokens'
        } else {
          finishReasonKind = 'stop'
        }
      }

      return false
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        let newlineIdx = buffer.indexOf('\n')
        while (newlineIdx !== -1) {
          const rawLine = buffer.slice(0, newlineIdx).replace(/\r$/, '')
          buffer = buffer.slice(newlineIdx + 1)
          if (rawLine.startsWith('data:')) {
            const isDone = yield* processSseDataLine(rawLine.slice(5))
            if (isDone) {
              buffer = ''
              break
            }
          }
          newlineIdx = buffer.indexOf('\n')
        }
      }

      if (buffer.trim().length > 0) {
        for (const line of buffer.split(/\r?\n/)) {
          if (line.startsWith('data:')) {
            const isDone = yield* processSseDataLine(line.slice(5))
            if (isDone) break
          }
        }
      }
    } finally {
      await reader.cancel().catch(() => {})
    }

    yield* closeActiveStreamBlock()

    for (const state of toolCallMap.values()) {
      yield {
        type: 'block-end',
        index: state.blockIndex,
        block: {
          type: 'tool-call',
          id: state.id,
          name: state.name || 'unknown_tool',
          arguments: state.args.length > 0 ? state.args : '{}',
        },
      }
    }

    if (toolCallMap.size > 0 && finishReasonKind === 'stop') finishReasonKind = 'tool-calls'

    // A 200 stream that produced no block at all is the degenerate completion
    // the host recognizes as a retryable empty response; treating it as a
    // normal stop ended the turn with nothing for the user or the loop.
    if (!sawVisible && finishReasonKind === 'stop') {
      throw new HitchfinError('channel returned an empty response', 'EMPTY_RESPONSE')
    }

    yield {
      type: 'usage',
      usage: latestUsage ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    }
    yield { type: 'finish', reason: { kind: finishReasonKind } }
  }
}
