/**
 * Pure channel-contract helpers: model-catalog normalization, sentinel URL
 * rewriting, package entry validation and error redaction. Kept free of worker
 * state so the protocol contract can be tested without starting a Worker thread.
 */

import { realpathSync } from 'node:fs'

const ANTHROPIC_NPM = '@ai-sdk/anthropic'
const VERTEX_ANTHROPIC_NPM = '@ai-sdk/google-vertex/anthropic'

function modelNpm(entry) {
  for (const holder of [entry?.provider, entry?.api]) {
    if (holder && typeof holder === 'object' && typeof holder.npm === 'string') return holder.npm
  }
  return ''
}

function normalizeEfforts(entry) {
  const variants = entry?.variants
  if (!variants || typeof variants !== 'object' || Array.isArray(variants)) return []
  return Object.keys(variants)
}

function capabilitiesInput(entry) {
  const capabilities = entry?.capabilities
  const input = capabilities && typeof capabilities === 'object' ? capabilities.input : undefined
  if (!input || typeof input !== 'object' || Array.isArray(input)) return []
  return Object.entries(input)
    .filter(([modality, value]) => value === true && (modality === 'text' || modality === 'image'))
    .map(([modality]) => modality)
}

export function normalizeModels(models) {
  const out = []
  if (!models || typeof models !== 'object' || Array.isArray(models)) return out
  for (const [id, entry] of Object.entries(models)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    const limit = typeof entry.limit === 'object' && entry.limit ? entry.limit : {}
    const modalities = typeof entry.modalities === 'object' && entry.modalities ? entry.modalities : {}
    // Config models carry `modalities`; live OpenCode model records carry the
    // same fact only as `capabilities.input` (`{ text: true, image: true }`).
    // Reading one and not the other made every signed-in WorkBuddy/Qoder model
    // look text-only.
    const declared = Array.isArray(modalities.input)
      ? modalities.input.filter((x) => typeof x === 'string')
      : []
    const fromCapabilities = capabilitiesInput(entry)
    const input = declared.length > 0 ? declared : fromCapabilities.length > 0 ? fromCapabilities : ['text']
    const context = Number(limit.context)
    const output = Number(limit.output)
    const npm = modelNpm(entry)
    out.push({
      id,
      name: typeof entry.name === 'string' && entry.name ? entry.name : id,
      ...(npm === ANTHROPIC_NPM || npm === VERTEX_ANTHROPIC_NPM
        ? { protocol: 'anthropic-messages' }
        : {}),
      ...(Number.isFinite(context) && context > 0 ? { contextWindow: context } : {}),
      ...(Number.isFinite(output) && output > 0 ? { maxTokens: output } : {}),
      input,
      efforts: normalizeEfforts(entry),
      free: entry.free === true,
      freeKnown: typeof entry.free === 'boolean',
    })
  }
  return out
}

function providerBase(loaded, options) {
  if (typeof options?.baseURL === 'string' && options.baseURL) return options.baseURL
  const api = loaded.providerConfig?.api
  if (typeof api === 'string' && api) return api
  if (api && typeof api === 'object' && typeof api.url === 'string' && api.url) return api.url
  return ''
}

export function channelUrl(loaded, options, original) {
  let parsed
  try {
    parsed = new URL(original)
  } catch {
    return original
  }
  if (parsed.hostname !== 'hitchfin.local') return original

  const base = providerBase(loaded, options).replace(/\/+$/, '')
  if (!base) throw new Error(`${loaded.provider}: channel has no base URL`)

  if (parsed.pathname.endsWith('/v1/messages') || parsed.pathname.endsWith('/messages')) {
    // A provider base may already name the full Messages endpoint; appending
    // again produced `/v1/messages/v1/messages`.
    if (/\/messages$/.test(base)) return base
    const root = base.replace(/\/(?:v1|v2)$/, '')
    return root + '/v1/messages'
  }
  if (base.endsWith('/chat/completions')) return base
  if (/\/(?:v1|v2|v3)$/.test(base)) return base + '/chat/completions'
  return base + '/v1/chat/completions'
}

/** Strip credentials before an error is logged or sent back to the host. */
export function redactError(error) {
  const raw = error instanceof Error ? error.message : String(error ?? '')
  return raw
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1[redacted]')
    .replace(/\b(?:sk|pk|jt|pt)-[A-Za-z0-9._-]{8,}/g, '[redacted]')
    .replace(/([?&](?:token|key|api_key|access_token|signature|sig)=)[^&\s]+/gi, '$1[redacted]')
    .slice(0, 300)
}

/** Resolve a channel package entry to a real, existing JS module path. */
export function resolvePackageEntry(channelId, packagePath) {
  if (typeof packagePath !== 'string' || !packagePath.trim()) {
    throw new Error(`${channelId}: channel package path is missing`)
  }
  let real
  try {
    real = realpathSync(packagePath)
  } catch {
    throw new Error(`${channelId}: channel package entry not found`)
  }
  if (!/\.(?:mjs|js|cjs)$/.test(real)) {
    throw new Error(`${channelId}: channel package entry must be a JS module`)
  }
  return real
}
