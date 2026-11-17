import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, '..')
const outFile = resolve(rootDir, 'client/client.js')

// Older builds compiled src/client/*.ts into lib/client; the bundle is the
// only client artifact now. Drop the dead output so npm pack stays lean.
rmSync(resolve(rootDir, 'lib/client'), { recursive: true, force: true })

// tsc never deletes output for a removed source or a disabled option; stale
// sourcemaps from earlier builds would otherwise ship pointing at unpublished
// ../src files.
const libDir = resolve(rootDir, 'lib')
const stack = existsSync(libDir) ? [libDir] : []
while (stack.length > 0) {
  const current = stack.pop()
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const full = join(current, entry.name)
    if (entry.isDirectory()) stack.push(full)
    else if (entry.name.endsWith('.map')) rmSync(full, { force: true })
  }
}

mkdirSync(dirname(outFile), { recursive: true })

const result = await esbuild.build({
  entryPoints: [resolve(rootDir, 'src/client/index.tsx')],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  write: false,
  jsx: 'automatic',
  external: ['react', 'react-dom', 'react/jsx-runtime', '@deepseek-ai/*'],
})

const innerCode = result.outputFiles[0].text
const wrapped = `window.__ModuleLoader__.load({
  id: "dsh-hitchfin",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
${innerCode}
    return module.exports;
  }
});
`

writeFileSync(outFile, wrapped, 'utf8')
// stdout stays machine-readable: `npm pack --json` parses whatever prepack
// prints there, so build progress goes to stderr.
process.stderr.write(`Built ${outFile} (${wrapped.length} bytes)\n`)
