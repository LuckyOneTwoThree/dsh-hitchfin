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

/** A hidden entry may be a canonical name (current) or a legacy model id. */
export function isModelHidden(
  model: Pick<NamedModel, 'id' | 'name'>,
  hidden: ReadonlySet<string>,
): boolean {
  return hidden.has(normalizedModelName(model.name)) || hidden.has(model.id)
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
  for (const token of hidden) {
    const byId = idToName.get(token)
    if (byId) {
      names.add(byId)
    } else {
      const normalized = normalizedModelName(token)
      names.add(knownNames.has(normalized) ? normalized : token)
    }
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
  if (/-Official/i.test(model.id)) score -= 1_000
  if (/_advisor_/i.test(model.id)) score -= 900
  if (/advisor/i.test(model.id)) score -= 500
  if (/search_agent/i.test(model.id)) score -= 2_000
  if (/Doubao_1_6/i.test(model.id)) score -= 300
  score -= model.id.length * 0.01
  if (model.contextWindow !== undefined) {
    score += Math.min(model.contextWindow, 1_000_000) / 1_000_000 * 10
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
 */
export function selectVisibleModels<T extends NamedModel>(
  raw: readonly T[],
  hidden: ReadonlySet<string>,
  freeOnly: boolean,
): VisibleModelSelection<T> {
  const hasFreeMetadata = raw.some((model) => model.freeKnown)
  const usable =
    freeOnly && hasFreeMetadata ? raw.filter((model) => model.freeKnown && model.free) : raw
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
