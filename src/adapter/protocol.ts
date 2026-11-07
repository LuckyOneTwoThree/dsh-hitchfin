import type { ChannelProtocol } from '../channels/descriptor.js'

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
