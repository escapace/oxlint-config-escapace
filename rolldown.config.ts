import { readdirSync } from 'node:fs'
import { defineConfig } from 'rolldown'
import { residualPlugin } from './scripts/rolldown-plugin-residual.ts'

const shims = Object.fromEntries(
  readdirSync('src/engines/oxlint/plugins')
    .filter((file) => file.endsWith('.ts'))
    .map((file) => [`plugins/${file.slice(0, -3)}`, `src/engines/oxlint/plugins/${file}`]),
)

const residualGroups = Object.fromEntries(
  readdirSync('src/generated/residual-groups')
    .filter((file) => file.endsWith('.ts'))
    .map((file) => [
      `residual-groups/${file.slice(0, -3)}`,
      `src/generated/residual-groups/${file}`,
    ]),
)

// TypeScript's CommonJS build references __filename/__dirname; the chunks are ESM
const banner = [
  "import { fileURLToPath as __escapaceFileUrlToPath } from 'node:url';",
  "import { dirname as __escapaceDirname } from 'node:path';",
  'const __filename = __escapaceFileUrlToPath(import.meta.url);',
  'const __dirname = __escapaceDirname(__filename);',
].join(' ')

export default defineConfig({
  external: [/^node:/, 'eslint', 'eslint/config', 'eslint/use-at-your-own-risk', 'oxlint'],
  input: {
    esclint: 'src/command/main.ts',
    eslint: 'src/eslint.ts',
    index: 'src/index.ts',
    ...shims,
    ...residualGroups,
  },
  output: {
    banner,
    chunkFileNames: 'chunks/[name]-[hash].js',
    codeSplitting: true,
    dir: 'lib/node',
    entryFileNames: '[name].js',
    format: 'esm',
    sourcemap: false,
  },
  platform: 'node',
  plugins: [residualPlugin()],
})
