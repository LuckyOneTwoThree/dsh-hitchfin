import test from 'node:test'
import assert from 'node:assert/strict'
import { ChannelWorkerHost } from '../lib/host/worker-host.js'
import { registerHitchfinRoutes } from '../lib/routes.js'
import { apply } from '../lib/index.js'
import { redactError, resolvePackageEntry } from '../worker/channel-contract.mjs'

const crashWorker = new URL('./fixtures/crash-worker.mjs', import.meta.url)
const auditWorker = new URL('./fixtures/audit-worker.mjs', import.meta.url)
const authWorker = new URL('./fixtures/auth-worker.mjs', import.meta.url)
const stallWorker = new URL('./fixtures/stall-worker.mjs', import.meta.url)
const channel = {
  channelId: 'workbuddy-cn',
  packagePath: '/tmp/mock-channel.mjs',
  exportName: 'Mock',
  provider: 'workbuddy',
}

// ---------------------------------------------------------------------------
// Error redaction and package entry validation

test('error redaction strips bearer tokens, api keys and query secrets', () => {
  const out = redactError(
    new Error('failed Bearer abc123.sk-XYZ and sk-abcdefghijk?token=secret123'),
  )
  assert.ok(!out.includes('abc123.sk'))
  assert.ok(!out.includes('sk-abcdefghijk'))
  assert.ok(!out.includes('secret123'))
  assert.ok(out.includes('[redacted]'))
  assert.equal(redactError('x'.repeat(500)).length, 300)
})

test('package entry validation rejects missing and non-JS paths', () => {
  assert.throws(() => resolvePackageEntry('x', ''), /missing/)
  assert.throws(() => resolvePackageEntry('x', '/tmp/definitely-missing-entry.mjs'), /not found/)
  assert.throws(
    () => resolvePackageEntry('x', new URL('../package.json', import.meta.url).pathname),
    /must be a JS module/,
  )
  const real = resolvePackageEntry(
    'x',
    new URL('../worker/channel-contract.mjs', import.meta.url).pathname,
  )
  assert.ok(real.endsWith('channel-contract.mjs'))
})

// ---------------------------------------------------------------------------
// Worker lifecycle

test('repeated worker crashes open a circuit breaker', async () => {
  const host = new ChannelWorkerHost({ workerPath: crashWorker, defaultTimeoutMs: 2000 })
  try {
    for (let i = 0; i < 3; i += 1) {
      await host.describe(channel).catch(() => {})
      await new Promise((resolve) => setTimeout(resolve, 40))
    }
    await assert.rejects(
      () => host.describe(channel),
      (error) => {
        assert.equal(error.code, 'SERVER')
        assert.match(error.message, /retry in/)
        return true
      },
    )
  } finally {
    await host.stop()
  }
})

test('cancelling a stuck callback rejects it instead of waiting for its timeout', async () => {
  const host = new ChannelWorkerHost({ workerPath: authWorker })
  try {
    const started = await host.authorize(channel, 'acct-1', 0)
    const pending = host.callback(channel, started.session)
    host.cancelAuth(started.session)
    await assert.rejects(
      () => pending,
      (error) => {
        assert.equal(error.code, 'ABORTED')
        return true
      },
    )
  } finally {
    await host.stop()
  }
})

test('a stopped host rejects further calls with WORKER_STOPPED', async () => {
  const host = new ChannelWorkerHost({ workerPath: auditWorker })
  await host.stop()
  await assert.rejects(
    () => host.describe(channel),
    (error) => {
      assert.equal(error.code, 'WORKER_STOPPED')
      return true
    },
  )
})

test('a session from a recycled worker cannot drive the new worker', async () => {
  const host = new ChannelWorkerHost({ workerPath: authWorker })
  try {
    const started = await host.authorize(channel, 'acct-1', 0)
    assert.match(started.session, /^\d+:/)

    await host.restart()

    // The old id must be refused locally instead of reaching the new worker,
    // whose own session counter restarted at 1.
    await assert.rejects(
      () => host.callback(channel, started.session),
      (error) => {
        assert.equal(error.code, 'ABORTED')
        return true
      },
    )

    const next = await host.authorize(channel, 'acct-1', 0)
    assert.notEqual(next.session.split(':')[0], started.session.split(':')[0])
  } finally {
    await host.stop()
  }
})

test('package loads emit a redacted-path audit event', async () => {
  const audits = []
  const host = new ChannelWorkerHost({
    workerPath: auditWorker,
    onAudit: (event) => audits.push(event),
  })
  try {
    await host.describe(channel)
    assert.equal(audits.length, 1)
    assert.equal(audits[0].channelId, 'workbuddy-cn')
    assert.equal(audits[0].packagePath, '/tmp/mock-channel.mjs')
  } finally {
    await host.stop()
  }
})

test('an intentional restart is not counted as a crash', async () => {
  const host = new ChannelWorkerHost({ workerPath: auditWorker })
  try {
    await host.describe(channel)
    await host.restart()
    await assert.doesNotReject(() => host.describe(channel))
  } finally {
    await host.stop()
  }
})

// ---------------------------------------------------------------------------
// Teardown

test('settings route registration returns a cleanup that unregisters', async () => {
  let unregistered = false
  const ctx = {
    webServer: {
      register: () => () => {
        unregistered = true
      },
    },
    logger: { info() {}, warn() {} },
    emit() {},
    get() {},
  }
  const cleanup = registerHitchfinRoutes(ctx, {
    registry: {},
    accounts: {},
    worker: {},
    adapter: {},
  })
  await new Promise((resolve) => setImmediate(resolve))
  cleanup()
  assert.equal(unregistered, true)
})

function pluginContext({ unregistered, effect, on }) {
  return {
    llm: { registerAdapter() {} },
    logger: { info() {}, warn() {} },
    credentials: {
      listRecords: async () => [],
      readRecord: async () => undefined,
      modifyRecord: async () => undefined,
      deleteRecord: async () => {},
    },
    authorization: { registerFlow: () => () => {} },
    webServer: {
      register: () => () => {
        unregistered.value = true
      },
    },
    inject(_deps, callback) {
      callback(this)
    },
    ...(effect ? { effect } : {}),
    ...(on ? { on } : {}),
    emit() {},
    get() {},
  }
}

test('plugin teardown uses the Cordis effect disposer, not a dispose event', async () => {
  const unregistered = { value: false }
  let teardown
  let usedDisposeEvent = false
  const ctx = pluginContext({
    unregistered,
    effect(setup) {
      teardown = setup()
      return () => {}
    },
    on(event) {
      if (event === 'dispose') usedDisposeEvent = true
    },
  })
  apply(ctx)
  assert.equal(usedDisposeEvent, false)
  assert.equal(typeof teardown, 'function')
  assert.doesNotThrow(() => teardown())
  assert.equal(unregistered.value, true)
})

test('legacy hosts without effect still receive the on(dispose) fallback', async () => {
  const unregistered = { value: false }
  let dispose
  const ctx = pluginContext({
    unregistered,
    on(event, listener) {
      if (event === 'dispose') dispose = listener
    },
  })
  apply(ctx)
  assert.equal(typeof dispose, 'function')
  assert.doesNotThrow(() => dispose())
  assert.equal(unregistered.value, true)
})

test('a stopped host rejects fetch calls without leaking a pending stream', async () => {
  const host = new ChannelWorkerHost({ workerPath: auditWorker })
  await host.stop()
  await assert.rejects(
    () =>
      host.fetch(
        'http://hitchfin.local/v1/chat/completions',
        { method: 'POST', body: '{}' },
        { channel },
      ),
    (error) => {
      assert.equal(error.code, 'WORKER_STOPPED')
      return true
    },
  )
})

test('a stalled response body is aborted by the idle watchdog', async () => {
  const host = new ChannelWorkerHost({
    workerPath: stallWorker,
    streamIdleTimeoutMs: 300,
  })
  try {
    const response = await host.fetch(
      'http://hitchfin.local/v1/chat/completions',
      { method: 'POST', body: '{}' },
      { channel },
    )
    assert.equal(response.status, 200)
    await assert.rejects(
      () => response.body.getReader().read(),
      (error) => {
        assert.equal(error.code, 'TIMEOUT')
        return true
      },
    )
  } finally {
    await host.stop()
  }
})

test('a channel that never sends headers times out the fetch itself', async () => {
  const host = new ChannelWorkerHost({
    workerPath: stallWorker,
    streamIdleTimeoutMs: 300,
  })
  try {
    await assert.rejects(
      () =>
        host.fetch(
          'http://hitchfin.local/v1/chat/completions',
          { method: 'POST', body: '{}' },
          { channel, model: 'no-head' },
        ),
      (error) => {
        assert.equal(error.code, 'TIMEOUT')
        return true
      },
    )
  } finally {
    await host.stop()
  }
})

test('a worker crash after response headers errors the active ReadableStream instead of hanging', async () => {
  const host = new ChannelWorkerHost({ workerPath: auditWorker })
  try {
    const response = await host.fetch(
      'http://hitchfin.local/v1/chat/completions',
      { method: 'POST', body: '{}' },
      { channel, model: 'crash-mid-stream' },
    )
    assert.equal(response.status, 200)
    const reader = response.body.getReader()
    const first = await reader.read()
    assert.equal(first.done, false)
    await assert.rejects(
      () => reader.read(),
      (error) => {
        assert.match(error.message, /exited with code 1/)
        return true
      },
    )
  } finally {
    await host.stop()
  }
})
