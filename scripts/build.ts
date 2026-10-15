/*
 * Bundle with rolldown, validate the bundled Oxlint half with the real binary,
 * emit declarations with tsc and publish those of the public entries only, and
 * check that TypeScript stays in the groups that parse it.
 */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { languages } from '../src/configuration/languages.ts'
import { oxlintConfiguration } from '../src/generated/oxlint-configuration.ts'
import { validateWithOxlint } from './codegen/print-config.ts'

const root = path.resolve(import.meta.dirname, '..')
const run = (command: string, arguments_: string[]): void => {
  execFileSync(path.join(root, 'node_modules/.bin', command), arguments_, {
    cwd: root,
    stdio: 'inherit',
  })
}

rmSync(path.join(root, 'lib'), { force: true, recursive: true })
run('rolldown', ['-c', 'rolldown.config.ts'])
validateWithOxlint(oxlintConfiguration)

// tsc declares every module; consumers get the declarations the entries reach: the options and the
// rule option types, never the engines
const declarations = path.join(root, '.cache/types')
rmSync(declarations, { force: true, recursive: true })
run('tsc', ['-p', 'tsconfig-build.json'])

const published = new Set<string>()
const publish = (file: string): void => {
  if (published.has(file)) {
    return
  }

  if (!existsSync(file)) {
    throw new Error(`build: ${path.relative(declarations, file)} is imported but was not declared`)
  }

  published.add(file)

  for (const match of readFileSync(file, 'utf8').matchAll(
    /(?:from|import)\s*(?:\(\s*)?["'](\.{1,2}\/[^"']+?)(?:\.d)?(?:\.ts|\.js)?["']/g,
  )) {
    publish(path.resolve(path.dirname(file), `${match[1] ?? ''}.d.ts`))
  }
}

for (const entry of ['index.d.ts', 'eslint.d.ts']) {
  publish(path.join(declarations, entry))
}

for (const file of published) {
  cpSync(file, path.join(root, 'lib/types', path.relative(declarations, file)))
}

// TypeScript is bundled once, and only the groups whose scripts it parses may load it (Vue's
// <script lang="ts">)
const output = path.join(root, 'lib/node')
const importsOf = (file: string): string[] =>
  [...readFileSync(file, 'utf8').matchAll(/(?:from|import)\s*["'](\.{1,2}\/[^"']+\.js)["']/g)]
    .map((match) => path.resolve(path.dirname(file), match[1] ?? ''))
    .filter((target) => existsSync(target))
const reaches = (
  file: string,
  target: (file: string) => boolean,
  seen = new Set<string>(),
): boolean => {
  if (seen.has(file)) {
    return false
  }

  seen.add(file)

  return target(file) || importsOf(file).some((next) => reaches(next, target, seen))
}
// rolldown marks each bundled module with its path; any package manager layout ends in node_modules/typescript/lib/
const containsTypescript = (file: string): boolean =>
  /\/\/#region [^\n]*node_modules\/typescript\/lib\//.test(readFileSync(file, 'utf8'))
const mayLoadTypescript = new Set(
  languages
    .filter((language) => language.eslint?.typescript === true)
    .map((language) => `residual-groups/${language.id}.js`),
)
const entries = [
  'index.js',
  'eslint.js',
  'esclint.js',
  ...['plugins', 'residual-groups'].flatMap((directory) =>
    readdirSync(path.join(output, directory)).map((name) => `${directory}/${name}`),
  ),
]
const leaking = entries.filter(
  (entry) => !mayLoadTypescript.has(entry) && reaches(path.join(output, entry), containsTypescript),
)

if (leaking.length > 0) {
  throw new Error(`build: these entries load the bundled TypeScript: ${leaking.join(', ')}`)
}
