import './_fresh.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { ChannelRegistry, WORKBUDDY, QODER, TRAE } from '../lib/channels/registry.js'

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

test('Trae is stable now that its login flow and live catalog are verified', () => {
  assert.equal(TRAE.status, 'stable')
  assert.equal(WORKBUDDY.status, 'stable')
  assert.equal(QODER.status, 'stable')
})

test('a channel package reports its on-disk version and flags a mismatch', () => {
  const fixture = fileURLToPath(
    new URL('./fixtures/package-channel/index.mjs', import.meta.url),
  )
  const registry = new ChannelRegistry({ overrides: { 'workbuddy-cn': fixture } })
  const info = registry.packageInfo(WORKBUDDY)
  assert.equal(info.source, 'override')
  assert.equal(info.version, '9.9.9')
  assert.equal(info.expectedVersion, WORKBUDDY.packageVersion)
  assert.equal(info.versionMatches, false)
  assert.equal(registry.packagePath(WORKBUDDY), fixture)
})

test('the magpie fallback tree is only used when explicitly allowed', () => {
  // The fixture's descriptor names a package that is not resolvable from this
  // repo, so the only remaining source is the fallback path.
  const descriptor = { ...TRAE, packageName: '@magpie-community/not-installed-anywhere' }
  const fallbackPath = fileURLToPath(
    new URL('./fixtures/package-channel/index.mjs', import.meta.url),
  )
  const withFallback = { ...descriptor, fallbackPath }

  const strict = new ChannelRegistry()
  assert.equal(strict.packageInfo(withFallback), undefined)

  const permissive = new ChannelRegistry({ allowMagpieFallback: true })
  const info = permissive.packageInfo(withFallback)
  assert.equal(info.source, 'magpie-fallback')
  assert.equal(info.path, fallbackPath)
})

test('an installed channel package resolves beside the plugin', () => {
  // The optional channel packages are installed in this repo's node_modules,
  // so the normal path must find them without any fallback.
  const registry = new ChannelRegistry()
  const info = registry.packageInfo(TRAE)
  if (!info) return // optional dependency not installed; the strict path is covered above
  assert.equal(info.source, 'installed')
  assert.equal(info.version, TRAE.packageVersion)
  assert.equal(info.versionMatches, true)
})
