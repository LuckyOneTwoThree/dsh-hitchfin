/**
 * Pure channel-contract helpers: model-catalog normalization and sentinel URL
 * rewriting. Kept free of worker state so the protocol contract can be tested
 * without starting a Worker thread.
 */

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

export function normalizeModels(models) {
  const out = []
  if (!models || typeof models !== 'object' || Array.isArray(models)) return out
  for (const [id, entry] of Object.entries(models)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    const limit = typeof entry.limit === 'object' && entry.limit ? entry.limit : {}
    const modalities = typeof entry.modalities === 'object' && entry.modalities ? entry.modalities : {}
    const input = Array.isArray(modalities.input)
      ? modalities.input.filter((x) => typeof x === 'string')
      : ['text']
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
    const root = base.replace(/\/(?:v1|v2)$/, '')
    return root + '/v1/messages'
  }
  if (base.endsWith('/chat/completions')) return base
  if (/\/(?:v1|v2|v3)$/.test(base)) return base + '/chat/completions'
  return base + '/v1/chat/completions'
}
