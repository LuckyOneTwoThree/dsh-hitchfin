import test from 'node:test'
import assert from 'node:assert/strict'
import { WORKBUDDY, QODER, TRAE } from '../lib/channels/registry.js'

test('WorkBuddy does not offer the sealed desktop sign-in', () => {
  assert.deepEqual(
    WORKBUDDY.authMethods.map((method) => method.id),
    ['browser', 'api-key'],
  )
})

test('auth method indexes still match the channel package methods array', () => {
  // The package still exposes three methods: 0 browser, 1 desktop (sealed),
  // 2 api key. Removing the desktop entry must not renumber the API key.
  assert.equal(WORKBUDDY.authMethods.find((m) => m.id === 'browser')?.index, 0)
  assert.equal(WORKBUDDY.authMethods.find((m) => m.id === 'api-key')?.index, 2)
  assert.deepEqual(
    QODER.authMethods.map((method) => method.index),
    [0, 1],
  )
  assert.deepEqual(
    TRAE.authMethods.map((method) => method.index),
    [0],
  )
})

test('Trae keeps its experimental status until a real account is verified', () => {
  assert.equal(TRAE.status, 'experimental')
  assert.equal(WORKBUDDY.status, 'stable')
  assert.equal(QODER.status, 'stable')
})
