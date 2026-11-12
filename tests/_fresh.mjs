/**
 * Guard against the "stale build" window.
 *
 * Every test imports `../lib/*.js` (compiled output), and `lib/` / `client/`
 * are gitignored. `npm test` rebuilds through `pretest`, but `node --test
 * tests/*.test.mjs`, an IDE runner or `npm test --ignore-scripts` do not. Those
 * used to pass against an old build after a source edit. Fail loudly instead.
 *
 * Imported by every test file; Node's module cache keeps the check cheap.
 */
import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(root, 'src')
const libDir = join(root, 'lib')
const clientEntry = join(root, 'client', 'client.js')
const hint = 'Run `npm run build` (or use `npm test`) before running the tests.'

function walk(dir, pattern) {
  const out = []
  const stack = [dir]
  while (stack.length > 0) {
    const current = stack.pop()
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) stack.push(full)
      else if (pattern.test(entry.name)) out.push(full)
    }
  }
  return out
}

if (!existsSync(libDir) || !existsSync(clientEntry)) {
  throw new Error(`dsh-hitchfin: build output is missing. ${hint}`)
}

const srcFiles = walk(srcDir, /\.(ts|tsx)$/)
const libFiles = walk(libDir, /\.js$/)
if (libFiles.length === 0) {
  throw new Error(`dsh-hitchfin: lib/ contains no compiled modules. ${hint}`)
}

// One second of slack absorbs same-second edits and filesystem timestamp
// granularity without hiding a genuinely stale build.
const SLOP_MS = 1_000

for (const src of srcFiles) {
  if (src.endsWith('.tsx')) continue
  const out = join(libDir, relative(srcDir, src).replace(/\.ts$/, '.js'))
  if (!existsSync(out)) {
    throw new Error(`dsh-hitchfin: ${relative(root, src)} has no compiled output. ${hint}`)
  }
  if (statSync(out).mtimeMs + SLOP_MS < statSync(src).mtimeMs) {
    throw new Error(`dsh-hitchfin: ${relative(root, out)} is older than its source. ${hint}`)
  }
}

// tsc never deletes output for a removed source file; catch orphaned modules.
for (const out of libFiles) {
  const src = join(srcDir, relative(libDir, out).replace(/\.js$/, '.ts'))
  if (!existsSync(src)) {
    throw new Error(`dsh-hitchfin: ${relative(root, out)} has no matching source. ${hint}`)
  }
}

const newestClientSource = Math.max(
  ...walk(join(srcDir, 'client'), /\.(ts|tsx)$/).map((file) => statSync(file).mtimeMs),
)
if (statSync(clientEntry).mtimeMs + SLOP_MS < newestClientSource) {
  throw new Error(`dsh-hitchfin: client/client.js is older than the client source. ${hint}`)
}
