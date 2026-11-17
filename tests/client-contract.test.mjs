import './_fresh.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const clientSource = readFileSync(join(root, 'src', 'client', 'index.tsx'), 'utf8')
const routesSource = readFileSync(join(root, 'src', 'routes.ts'), 'utf8')
const clientBundle = readFileSync(join(root, 'client', 'client.js'), 'utf8')

test('every settings-page endpoint exists on the server', () => {
  const routePaths = new Set(
    [...routesSource.matchAll(/path === '([^']+)'/g)].map((match) => match[1]),
  )
  assert.ok(routePaths.size >= 10, 'expected the settings route table')
  const used = new Set(
    [...clientSource.matchAll(/\/dsh-hitchfin(\/[a-z/-]+)?/g)].map(
      (match) => match[1] || '/',
    ),
  )
  assert.ok(used.size >= 10, 'expected the client to call the settings API')
  for (const path of used) {
    assert.ok(routePaths.has(path), `client calls an unknown endpoint: ${path}`)
  }
})

test('inline translations always provide both languages', () => {
  let checked = 0
  for (const match of clientSource.matchAll(
    /\bT\('((?:[^'\\]|\\.)*)',\s*'((?:[^'\\]|\\.)*)'\)/g,
  )) {
    checked += 1
    assert.ok(
      match[1].trim().length > 0 && match[2].trim().length > 0,
      `empty translation: T('${match[1]}', '${match[2]}')`,
    )
  }
  assert.ok(checked > 50, `expected many inline translations, found ${checked}`)
})

test('the published client bundle contains the current endpoints', () => {
  for (const endpoint of [
    '/dsh-hitchfin/models/refresh',
    '/dsh-hitchfin/account/order',
    '/dsh-hitchfin/login/apikey',
    '/dsh-hitchfin/state',
  ]) {
    assert.ok(clientBundle.includes(endpoint), `bundle is missing ${endpoint}`)
  }
})

test('deferred refreshes are ordered and their timers are owned', () => {
  assert.ok(clientSource.includes('requestSeq.current'), 'refresh has no request generation guard')
  assert.ok(clientSource.includes('timers.current'), 'deferred timers are not tracked')
  assert.equal(
    [...clientSource.matchAll(/window\.setTimeout\(\(\) => \{\s*void refresh/g)].length,
    0,
    'a refresh timer bypasses the managed scheduler',
  )
  assert.ok(clientSource.includes('safeExternalUrl'), 'login links are not protocol-checked')
})

test('the two locale files expose the same keys', () => {
  const zh = JSON.parse(readFileSync(join(root, 'locale', 'zh.json'), 'utf8'))
  const en = JSON.parse(readFileSync(join(root, 'locale', 'en.json'), 'utf8'))
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort())
  for (const key of Object.keys(zh)) {
    assert.equal(typeof zh[key], 'string')
    assert.equal(typeof en[key], 'string')
    assert.ok(zh[key].length > 0 && en[key].length > 0)
  }
})

test('package manifest declares matching open host compatibility ranges', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  assert.equal(pkg.engines?.dsh, '>=0.2.2-rc.1')
  assert.equal(pkg.dsh?.engines?.dsh, pkg.engines?.dsh)
  for (const [dep, range] of Object.entries(pkg.peerDependencies ?? {})) {
    if (dep === '@deepseek-ai/dsh' || dep.startsWith('@deepseek-ai/dsh-')) {
      assert.equal(range, pkg.engines.dsh, `${dep} should not exact-pin host version`)
    }
  }
})

test('the login poller recovers from an expired (404) login', () => {
  assert.ok(clientSource.includes('class HttpError'), 'fetch errors carry no HTTP status')
  assert.ok(
    clientSource.includes("err instanceof HttpError && err.status === 404"),
    'expired logins are not detected',
  )
  // The polling catch, cancel and code paths must all drop the dead slot.
  const recoveries = [...clientSource.matchAll(/err instanceof HttpError && err\.status === 404/g)]
  assert.ok(recoveries.length >= 3, `expected 3 recovery paths, found ${recoveries.length}`)
})

test('a successful sign-in still refreshes quota after the effect tears down', () => {
  assert.equal(
    clientSource.includes('if (!stopped) void refresh(true)'),
    false,
    'the post-login quota refresh is swallowed by the effect cleanup flag',
  )
})

test('optimistic writes cannot starve the first quota refresh', () => {
  assert.ok(clientSource.includes('quotaReadyRef.current'), 'quota readiness is not tracked')
  assert.ok(clientSource.includes('const ensureQuota'), 'writes do not retry a discarded quota read')
  const calls = [...clientSource.matchAll(/ensureQuota\(\)/g)]
  assert.ok(calls.length >= 3, 'ensureQuota must run after each optimistic write path')
})

test('starting a sign-in on another channel cancels the dangling login', () => {
  assert.ok(clientSource.includes('cancelDanglingLogin'), 'cross-channel logins overwrite the slot')
  const calls = [...clientSource.matchAll(/await cancelDanglingLogin\(/g)]
  assert.ok(calls.length >= 2, 'both browser and PAT sign-in must clear the old slot')
})
