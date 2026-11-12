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
