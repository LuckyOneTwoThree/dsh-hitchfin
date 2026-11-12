import './_fresh.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { ChannelRegistry } from '../lib/channels/registry.js'
import { ChannelWorkerHost } from '../lib/host/worker-host.js'

/**
 * Load the real @magpie-community packages inside the production worker. Most
 * suites use tiny fixtures; an upgrade that breaks `factoryOf`, the shim input
 * or the auth.methods shape would otherwise only be noticed in the desktop.
 */
test('every installed channel package loads inside the worker', async () => {
  const registry = new ChannelRegistry()
  const host = new ChannelWorkerHost()
  const loaded = []
  try {
    for (const descriptor of registry.all()) {
      const info = registry.packageInfo(descriptor)
      if (!info) continue // missing optional dep: the contract probe reports it
      const loadInfo = registry.loadInfo(descriptor)
      const described = await host.describe(loadInfo)
      assert.equal(typeof described.provider, 'string')
      assert.ok(described.provider.length > 0, `${descriptor.id}: empty provider id`)
      assert.ok(Array.isArray(described.methods), `${descriptor.id}: no methods array`)
      assert.ok(described.methods.length > 0, `${descriptor.id}: no sign-in methods`)
      assert.ok(described.hooks.includes('auth'), `${descriptor.id}: no auth hook`)
      loaded.push(descriptor.id)
    }
    assert.equal(loaded.length, 3, 'all three channel packages must be installed')
  } finally {
    await host.stop()
  }
})
