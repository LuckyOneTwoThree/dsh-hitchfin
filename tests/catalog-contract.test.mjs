import './_fresh.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { isLiveCatalog, markFallbackCatalog } from '../worker/channel-contract.mjs'

const fallback = () => markFallbackCatalog({ 'static-a': { id: 'a' }, 'static-b': { id: 'b' } })
const live = () => ({ 'live-a': { id: 'a', name: 'Live A' } })

test('the static fallback catalog is never published as a live read', () => {
  const base = fallback()
  assert.equal(isLiveCatalog(base, base), false)
})

test('a tagged or shallow-copied fallback is still recognized as a failure', () => {
  const base = fallback()
  assert.equal(isLiveCatalog(base, { ...base }), false)
  const copied = { ...base }
  Object.defineProperty(copied, Symbol('hitchfin.fallbackCatalog'), { value: true })
  assert.equal(isLiveCatalog(base, copied), false)
})

test('an empty or non-object answer is a failed live read', () => {
  const base = fallback()
  for (const answer of [undefined, null, [], '', 42, {}]) {
    assert.equal(isLiveCatalog(base, answer), false)
  }
})

test('a fresh non-empty catalog is accepted as a live read', () => {
  const base = fallback()
  assert.equal(isLiveCatalog(base, live()), true)
  // A successful read that happens to reuse one id is still a new catalog.
  assert.equal(isLiveCatalog(base, { 'static-a': { id: 'a', name: 'Live' } }), true)
})

test('markFallbackCatalog tolerates frozen and primitive tables', () => {
  const frozen = Object.freeze({ a: { id: 'a' } })
  assert.equal(markFallbackCatalog(frozen), frozen)
  assert.equal(isLiveCatalog(frozen, frozen), false)
  assert.equal(markFallbackCatalog(undefined), undefined)
})
