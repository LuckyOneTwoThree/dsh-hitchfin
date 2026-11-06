import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, '..')
const outFile = resolve(rootDir, 'client/client.js')

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
console.log(`Built ${outFile} (${wrapped.length} bytes)`)
