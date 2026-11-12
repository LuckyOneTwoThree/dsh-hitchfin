import './_fresh.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

test('installed channel packages satisfy the plugin contract', () => {
  const result = spawnSync(process.execPath, [resolve(root, 'scripts/contract-probe.mjs')], {
    cwd: root,
    encoding: 'utf8',
    timeout: 60_000,
  })
  assert.equal(result.status, 0, `${result.stdout ?? ''}\n${result.stderr ?? ''}`)
  assert.match(result.stdout, /contract probe: descriptors match/)
})
