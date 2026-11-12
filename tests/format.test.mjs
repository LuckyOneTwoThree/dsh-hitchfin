import './_fresh.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { compactNumber, groupedNumber, parsePercent, quotaPercent, quotaValue } from '../lib/format.js'

// The window shapes the channel packages actually send, as read from
// @magpie-community/opencode-{trae,qoder,workbuddy}-auth.
const traeCredits = {
  name: 'Credits',
  used: 13.033177142857145,
  amount: 2.61,
  limit: 20,
  unit: 'credits',
  resetsAt: '2026-11-11T00:00:00.000Z',
}
const workbuddyTokens = {
  name: 'Free model tokens',
  used: 42.5,
  amount: 85000000,
  limit: 200000000,
  unit: 'tokens',
  display: '85.0M / 200M',
}
const qoderCredits = {
  name: 'Credits',
  used: 9.15,
  amount: 183,
  limit: 2000,
  unit: 'credits',
  display: '183 / 2,000 credits',
}

test('a window with no display is shown as its count, never as a raw share', () => {
  assert.equal(quotaValue(traeCredits), '2.61 / 20 credits')
  // The float that used to be printed verbatim (13.033177142857145).
  assert.ok(!quotaValue(traeCredits).includes('13.0331'))
  assert.equal(Math.round(quotaPercent(traeCredits)), 13)
})

test('a vendor display string is kept as the vendor wrote it', () => {
  assert.equal(quotaValue(workbuddyTokens), '85.0M / 200M')
  assert.equal(quotaValue(qoderCredits), '183 / 2,000 credits')
})

test('the share comes from the window reading even when its display cannot be parsed', () => {
  // "85.0M / 200M" has no plain used/total pair, so the reading is the answer.
  assert.equal(Math.round(quotaPercent(workbuddyTokens)), 43)
  assert.equal(Math.round(quotaPercent(qoderCredits)), 9)
})

test('a share-only window says the share, rounded, not the float behind it', () => {
  assert.equal(quotaValue({ name: 'Credits', used: 13.033177142857145 }), '13.03%')
  assert.equal(quotaValue({ name: 'Credits', used: 100 }), '100%')
})

test('counts group thousands and drop trailing zeros', () => {
  assert.equal(groupedNumber(1234567.891), '1,234,567.89')
  assert.equal(groupedNumber(2000), '2,000')
  assert.equal(groupedNumber(999), '999')
  assert.equal(groupedNumber(0.5), '0.5')
  assert.equal(compactNumber(13), '13')
  assert.equal(compactNumber(13.5), '13.5')
  assert.equal(compactNumber(13.0), '13')
  assert.equal(compactNumber(13.005), '13.01')
})

test('a window with no limit falls back to what it does say', () => {
  assert.equal(quotaValue({ name: 'Credits', amount: 4.5, unit: 'credits' }), '4.5 credits')
  assert.equal(quotaValue({ name: 'Credits', limit: 0, amount: 4, unit: 'credits' }), '4 credits')
  assert.equal(quotaValue({ name: 'Credits', limit: -1, display: 'unlimited' }), 'unlimited')
})

test('a unit is not invented, and a window saying nothing says nothing', () => {
  assert.equal(quotaValue({ name: 'Credits', amount: 5, limit: 10 }), '5 / 10')
  assert.equal(quotaValue({ name: 'Credits' }), '')
  assert.equal(quotaValue({ name: 'Credits' }).trim(), '')
  assert.equal(quotaPercent({ name: 'Credits' }), undefined)
})

test('a share is clamped to a sane range', () => {
  assert.equal(quotaPercent({ name: 'Credits', used: -5 }), 0)
  assert.equal(quotaPercent({ name: 'Credits', used: 130 }), 100)
  assert.equal(quotaPercent({ name: 'Credits', display: '0 / 0 credits' }), undefined)
  assert.equal(parsePercent('183 / 2,000 credits'), 9.15)
})
