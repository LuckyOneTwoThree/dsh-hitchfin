import type { ChannelProtocol } from '../channels/descriptor.js'
import { HitchfinError } from '../errors.js'

/** Transport shapes this plugin can actually emit. */
export type TransportProtocol = 'openai-completions' | 'anthropic-messages'

export interface ProtocolCandidate {
  id: string
  protocol?: ChannelProtocol
}

/**
 * Pick the request/stream shape for one model.
 *
 * The channel package marks native Messages models with
 * api.npm (live catalog) or provider.npm (config catalog); the worker
 * normalizes that into `record.protocol`. A channel descriptor is a hard gate:
 * a channel that never declares `anthropic-messages` stays on chat completions
 * even if a package happens to expose an Anthropic-looking npm field.
 *
 * When metadata is missing, fall back to the same model-id heuristic the
 * channel package itself uses (nativeOf: site.messages && /^claude-/).
 */
export function selectTransportProtocol(
  descriptor: { protocols: readonly ChannelProtocol[] },
  record: ProtocolCandidate | undefined,
): TransportProtocol {
  if (!descriptor.protocols.includes('anthropic-messages')) return 'openai-completions'
  if (record?.protocol === 'anthropic-messages') return 'anthropic-messages'
  if (record?.protocol) return 'openai-completions'
  if (/^claude-/i.test(record?.id ?? '')) return 'anthropic-messages'
  return 'openai-completions'
}

/** One unterminated SSE line may not grow without bound (HTML error pages). */
const MAX_SSE_BUFFER_CHARS = 8 * 1024 * 1024

function isCompleteJson(text: string): boolean {
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

/**
 * SSE framing shared by both transports: events end at a blank line, several
 * `data:` lines join with `\n`, and `\r\n`, `\r` and `\n` are all line ends.
 * A vendor that omits the blank line after a complete JSON payload still
 * streams: a single data line that parses on its own dispatches immediately.
 * The reader is cancelled on every exit path, including a consumer `break`.
 */
export async function* ssePayloads(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string, void, unknown> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let dataParts: string[] = []
  let dataChars = 0

  const takeEvent = (): string | undefined => {
    if (dataParts.length === 0) return undefined
    const payload = dataParts.join('\n')
    dataParts = []
    dataChars = 0
    return payload.trim() ? payload : undefined
  }

  const processLine = (line: string): string | undefined => {
    if (line === '') return takeEvent()
    if (line.startsWith(':')) return undefined
    if (!line.startsWith('data:')) return undefined
    let value = line.slice(5)
    if (value.startsWith(' ')) value = value.slice(1)
    dataParts.push(value)
    dataChars += value.length
    if (dataChars > MAX_SSE_BUFFER_CHARS) {
      throw new HitchfinError('channel SSE event exceeded the buffer limit', 'TRANSPORT')
    }
    if (dataParts.length === 1) {
      const trimmed = value.trim()
      if (trimmed === '[DONE]' || isCompleteJson(trimmed)) return takeEvent()
    }
    return undefined
  }

  const processBuffer = function* (text: string): Generator<string, void, unknown> {
    const lineEnd = /\r\n|\r|\n/g
    let last = 0
    let match: RegExpExecArray | null
    while ((match = lineEnd.exec(text)) !== null) {
      const payload = processLine(text.slice(last, match.index))
      last = lineEnd.lastIndex
      if (payload !== undefined) yield payload
    }
    buffer = text.slice(last)
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      if (buffer.length > MAX_SSE_BUFFER_CHARS) {
        throw new HitchfinError('channel SSE line exceeded the buffer limit', 'TRANSPORT')
      }
      // A trailing \r may be the first half of a \r\n split across chunks;
      // hold it back so it does not become a spurious blank line.
      const hold = buffer.endsWith('\r') ? '\r' : ''
      const text = hold ? buffer.slice(0, -1) : buffer
      yield* processBuffer(text)
      buffer = hold + buffer
    }
    buffer += decoder.decode()
    yield* processBuffer(buffer)
    if (buffer.length > 0) {
      const payload = processLine(buffer)
      if (payload !== undefined) yield payload
    }
    const tail = takeEvent()
    if (tail !== undefined) yield tail
  } finally {
    await reader.cancel().catch(() => {})
  }
}
