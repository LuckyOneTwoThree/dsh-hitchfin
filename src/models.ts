export interface NamedModel {
  id: string
  name: string
  free: boolean
  freeKnown: boolean
  contextWindow?: number
  maxTokens?: number
  input?: readonly string[]
  efforts?: readonly string[]
}

export function normalizedModelName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Separator-insensitive name key. Vendors rename the same model between
 * catalog reads (`Kimi K2.6` in the static fallback, `Kimi-K2.6` live), so a
 * hidden name stored against one spelling must still hide the other.
 */
export function looseModelKey(value: string): string {
  return normalizedModelName(value).replace(/[^a-z0-9]+/g, '')
}

/** A hidden entry may be a canonical name (current) or a legacy model id. */
export function isModelHidden(
  model: Pick<NamedModel, 'id' | 'name'>,
  hidden: ReadonlySet<string>,
): boolean {
  if (hidden.has(normalizedModelName(model.name)) || hidden.has(model.id)) return true
  const key = looseModelKey(model.name)
  if (!key) return false
  for (const token of hidden) {
    if (looseModelKey(token) === key) return true
  }
  return false
}

/**
 * Normalize stored hidden tokens into canonical names. An id written by an
 * older build must hide the whole name group, otherwise its aliases survive
 * dedupe and the model reappears in DSH.
 */
export function resolveHiddenNames(
  raw: readonly Pick<NamedModel, 'id' | 'name'>[],
  hidden: ReadonlySet<string>,
): Set<string> {
  const idToName = new Map<string, string>()
  const knownNames = new Set<string>()
  for (const model of raw) {
    const name = normalizedModelName(model.name)
    if (!name || name === '-') continue
    idToName.set(model.id, name)
    knownNames.add(name)
  }
  const names = new Set<string>()
  // An all-non-ASCII name has an empty loose key; matching those would make
  // every Chinese/symbol model name look identical.
  const looseNames = [...knownNames]
    .map((name) => [looseModelKey(name), name] as const)
    .filter(([key]) => key.length > 0)
  for (const token of hidden) {
    const byId = idToName.get(token)
    if (byId) {
      names.add(byId)
      continue
    }
    const normalized = normalizedModelName(token)
    if (knownNames.has(normalized)) {
      names.add(normalized)
      continue
    }
    // A name written before a vendor rename maps onto the current spelling.
    const loose = looseModelKey(token)
    const match = loose ? looseNames.find(([key]) => key === loose)?.[1] : undefined
    names.add(match ?? token)
  }
  return names
}

/**
 * Trae's live catalog exposes one display model under several internal ids
 * (`-Official`, `_advisor_`, `Doubao_1_6`, ...). DSH selects by id, so without
 * this the same model appears many times under the same label.
 */
function preference(model: NamedModel): number {
  let score = 0
  if (model.freeKnown && model.free) score += 10_000
  if (model.freeKnown) score += 100
  // The canonical id usually spells the display name; a routing twin or an
  // -Official/_advisor_ alias does not. This has to outweigh every other
  // tiebreaker, or the id DSH actually sends becomes vendor-internal.
  if (normalizedModelName(model.id) === normalizedModelName(model.name)) score += 500
  if (/-Official/i.test(model.id)) score -= 1_000
  if (/_advisor_/i.test(model.id)) score -= 900
  if (/advisor/i.test(model.id)) score -= 500
  if (/search_agent/i.test(model.id)) score -= 2_000
  if (/Doubao_1_6/i.test(model.id)) score -= 300
  if (/-auto(?:-max)?$/i.test(model.id)) score -= 800
  if (/sub_?agent|computer_use|browser_use|explore_|file_search/i.test(model.id)) score -= 800
  score -= model.id.length * 0.01
  if (model.contextWindow !== undefined) {
    // Tiebreaker only. Trae's -auto twins advertise a larger context window
    // than the real model; scoring it at up to +10 used to make the twin win.
    score += Math.min(model.contextWindow, 1_000_000) / 1_000_000
  }
  return score
}

export function dedupeModels<T extends NamedModel>(models: readonly T[]): T[] {
  const byName = new Map<string, T>()
  for (const model of models) {
    const name = normalizedModelName(model.name)
    if (!name || name === '-') continue
    const existing = byName.get(name)
    if (!existing || preference(model) > preference(existing)) {
      byName.set(name, model)
    }
  }
  return [...byName.values()]
}

export interface VisibleModelSelection<T> {
  /** Deduped, hidden-free models for display and DSH registration. */
  models: T[]
  /** Every id that survived the hidden filter, before name dedupe. */
  candidates: T[]
  hasFreeMetadata: boolean
}

/**
 * One shared visibility calculation for both the settings page and the DSH
 * model catalog. Hiding a canonical name removes every alias id at once, so
 * the order of filtering and name dedupe can no longer change the outcome.
 *
 * `unknownFreeAsPaid` covers a channel that normally publishes free metadata
 * but whose listing just failed (or returned a static fallback). Under
 * free-only we then cannot prove a model is free, so it is hidden instead of
 * silently offering a paid model. Channels that never publish this metadata
 * (Trae) keep showing every model, as documented.
 */
export function selectVisibleModels<T extends NamedModel>(
  raw: readonly T[],
  hidden: ReadonlySet<string>,
  freeOnly: boolean,
  unknownFreeAsPaid = false,
): VisibleModelSelection<T> {
  const hasFreeMetadata = raw.some((model) => model.freeKnown)
  const usable = freeOnly
    ? hasFreeMetadata
      ? raw.filter((model) => model.freeKnown && model.free)
      : unknownFreeAsPaid
        ? []
        : raw
    : raw
  const hiddenNames = resolveHiddenNames(raw, hidden)
  const candidates = usable.filter(
    (model) => !hiddenNames.has(normalizedModelName(model.name)),
  )
  return { models: dedupeModels(candidates), candidates, hasFreeMetadata }
}

/**
 * Convert stored hidden tokens into canonical names shared by every account.
 * Legacy ids are resolved against the current catalog; unknown tokens are kept
 * so a model that is temporarily absent does not silently lose its setting.
 */
export function canonicalHiddenNames(
  rawById: ReadonlyMap<string, NamedModel>,
  hiddenPerAccount: readonly (readonly string[])[],
): string[] {
  if (hiddenPerAccount.length === 0) return []
  const raw = [...rawById.values()]
  const sets = hiddenPerAccount.map((tokens) =>
    resolveHiddenNames(raw, new Set(tokens)),
  )
  let shared = [...sets[0]]
  for (const set of sets.slice(1)) shared = shared.filter((name) => set.has(name))
  return shared.sort()
}

/** Minimal shape needed to build hidden tokens for a bulk show/hide action. */
export interface ModelToken {
  id: string
  name: string
}

/**
 * Remove every stored spelling of one model from a hidden-token list.
 *
 * A fully non-ASCII model name has an empty loose key. Matching on that would
 * make every such name identical, so the loose comparison only applies when
 * the key is non-empty — the same guard `bulkHiddenTokens` uses.
 */
export function unhideModelTokens(
  hidden: readonly string[],
  model: ModelToken,
): string[] {
  const key = normalizedModelName(model.name)
  const loose = looseModelKey(key)
  return hidden.filter(
    (token) =>
      token !== key &&
      token !== model.id &&
      !(loose.length > 0 && looseModelKey(token) === loose),
  )
}

/**
 * Show or hide a set of models in one settings write. Hiding stores both the
 * canonical name and the id, so a vendor rename cannot bring a model back;
 * showing removes every spelling of those tokens (name, id and loose variants)
 * while leaving tokens for models outside the set untouched.
 */
export function bulkHiddenTokens(
  models: readonly ModelToken[],
  hidden: readonly string[],
  action: 'show' | 'hide',
): string[] {
  if (action === 'hide') {
    return [
      ...new Set([
        ...hidden,
        ...models.flatMap((model) => [normalizedModelName(model.name), model.id]),
      ]),
    ]
  }
  const ids = new Set(models.map((model) => model.id))
  const names = new Set(models.map((model) => normalizedModelName(model.name)))
  // Empty loose keys are not identities: without this filter, showing one
  // Chinese-named model would also clear every other Chinese-named token.
  const loose = new Set(
    models.map((model) => looseModelKey(model.name)).filter((key) => key.length > 0),
  )
  return hidden.filter((token) => {
    const key = looseModelKey(token)
    return !ids.has(token) && !names.has(token) && !(key.length > 0 && loose.has(key))
  })
}
