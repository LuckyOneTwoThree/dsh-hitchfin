/**
 * Channel-package contract probe.
 *
 * The plugin hard-codes each channel's sign-in method indexes because the
 * channel packages expose `auth.methods` as a positional array. A package
 * upgrade can reorder or extend that array, and the plugin would then send a
 * sign-in to the wrong method without any error.
 *
 * This probe loads the three real channel packages, reads their
 * `auth.methods`, and compares the result with the descriptors in
 * `lib/channels/registry.js`. It needs no account and no network: it only
 * builds the plugin factory and inspects the returned hooks.
 *
 * Usage: node scripts/contract-probe.mjs
 * Exits non-zero when a descriptor and its package disagree.
 */

import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ChannelRegistry, WORKBUDDY, QODER, TRAE } from '../lib/channels/registry.js'

const require = createRequire(import.meta.url)

/** The `kind` a package method type maps to in our descriptors. */
const KIND_BY_PACKAGE_TYPE = { oauth: 'browser', api: 'api-key' }

function shimInput() {
  return {
    client: {
      auth: { set: async () => {} },
      app: { log: async () => {} },
    },
    project: { id: 'contract-probe', worktree: process.cwd(), time: { created: Date.now() } },
    directory: process.cwd(),
    worktree: process.cwd(),
    experimental_workspace: { register() {} },
    serverUrl: new URL('http://127.0.0.1:4096'),
    $: async () => ({ stdout: '', stderr: '', exitCode: 0 }),
    magpie: {
      get: async () => undefined,
      set: async () => {},
      delete: async () => {},
      list: async () => ({}),
    },
  }
}

async function loadMethods(descriptor) {
  let main
  try {
    main = require.resolve(descriptor.packageName)
  } catch {
    return { skipped: `${descriptor.packageName} is not installed` }
  }
  const indexPath = join(dirname(main), 'index.mjs')
  const entry = existsSync(indexPath) ? indexPath : main
  const mod = await import(pathToFileURL(entry).href)
  const factory = mod[descriptor.exportName] ?? mod.default
  if (typeof factory !== 'function') {
    return { error: `${descriptor.packageName} exports no ${descriptor.exportName} factory` }
  }
  const hooks = (await factory(shimInput(), {})) ?? {}
  const methods = Array.isArray(hooks.auth?.methods) ? hooks.auth.methods : []
  return {
    hooks,
    methods: methods.map((method, index) => ({
      index,
      type: typeof method?.type === 'string' ? method.type : '',
      label: typeof method?.label === 'string' ? method.label : '',
      kind: KIND_BY_PACKAGE_TYPE[method?.type] ?? 'unsupported',
    })),
  }
}

const problems = []
const notes = []

/**
 * The worker hands each package a static fallback catalog and treats a live
 * read as failed when the package returns that table. All three packages do
 * `return provider.models` while signed out; assert that here so a future
 * release cannot silently change the contract the worker relies on. (A
 * successful live read needs a real account and is covered by the smoke test.)
 */
async function checkModelsContract(descriptor, hooks) {
  if (typeof hooks?.provider?.models !== 'function') {
    return `${descriptor.id}: package exposes no provider.models hook`
  }
  const fallback = { 'probe-model': { id: 'probe-model', name: 'Probe' } }
  const provider = { id: descriptor.packageProvider, models: fallback }
  try {
    const answer = await hooks.provider.models(provider, { auth: undefined })
    if (answer !== fallback) {
      return `${descriptor.id}: provider.models must return the passed-in catalog when signed out`
    }
  } catch (error) {
    return `${descriptor.id}: provider.models threw while signed out: ${error?.message ?? error}`
  }
  return ''
}

for (const descriptor of [WORKBUDDY, QODER, TRAE]) {
  const registry = new ChannelRegistry()
  const info = registry.packageInfo(descriptor)
  if (info && info.versionMatches === false) {
    problems.push(
      `${descriptor.id}: installed ${info.version}, descriptor expects ${descriptor.packageVersion}`,
    )
  }
  if (info && info.version === undefined) {
    notes.push(`${descriptor.id}: package version unreadable at ${info.path}`)
  }

  const result = await loadMethods(descriptor)
  if (result.skipped) {
    // A missing package is not a pass: the whole point of this probe is to
    // compare the installed release with the indexes we hard-code.
    problems.push(`${descriptor.id}: ${result.skipped}; the sign-in contract cannot be verified`)
    continue
  }
  if (result.error) {
    problems.push(`${descriptor.id}: ${result.error}`)
    continue
  }

  const modelsContract = await checkModelsContract(descriptor, result.hooks)
  if (modelsContract) problems.push(modelsContract)

  for (const method of descriptor.authMethods) {
    const actual = result.methods[method.index]
    if (!actual) {
      problems.push(`${descriptor.id}: ${method.id} points at index ${method.index}, which does not exist`)
      continue
    }
    const expectedKind =
      method.kind === 'pat' ? 'browser' : method.kind === 'api-key' ? 'api-key' : method.kind
    if (actual.kind !== expectedKind) {
      problems.push(
        `${descriptor.id}: ${method.id} expects a ${expectedKind} method at index ${method.index}, ` +
          `found ${actual.kind || actual.type || 'nothing'} ("${actual.label}")`,
      )
    }
  }

  const exposed = new Set(descriptor.authMethods.map((method) => method.index))
  const hidden = result.methods.filter((method) => !exposed.has(method.index))
  notes.push(
    `${descriptor.id}: ${result.methods.length} package method(s), ${exposed.size} exposed` +
      (hidden.length > 0
        ? `; not exposed: ${hidden.map((m) => `${m.index} ${m.type} "${m.label}"`).join(', ')}`
        : ''),
  )
}

for (const note of notes) console.log(`note: ${note}`)
if (problems.length > 0) {
  for (const problem of problems) console.error(`FAIL: ${problem}`)
  process.exitCode = 1
} else {
  console.log('contract probe: descriptors match the installed channel packages')
}
