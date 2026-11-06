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

function normalizedName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
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
    const name = normalizedName(model.name)
    if (!name || name === '-') continue
    const existing = byName.get(name)
    if (!existing || preference(model) > preference(existing)) {
      byName.set(name, model)
    }
  }
  return [...byName.values()]
}
