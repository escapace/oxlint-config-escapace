/*
 * Runs the consumer's Oxlint with the Node that runs esclint. Its output
 * streams through esclint, so first-run failures can carry a hint at a terminal
 * as in CI; JSON is collected so it can be merged with the residual's.
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { stripVTControlCharacters } from 'node:util'
import ignore from 'ignore'
import { ignorePatterns as generatedIgnorePatterns } from '../configuration/ignores.ts'
import {
  checkoutPatterns,
  ignoreFilesIn,
  readIgnoreFile,
  rebaseIgnorePattern,
} from '../engines/shared.ts'
import type { Arguments } from './arguments.ts'
import { colourEnvironment } from './colour.ts'
import { findOxlintBinary } from './presence.ts'
import { isOxlintJsonOutput, type OxlintJsonOutput } from './renderers/render.ts'

export interface OxlintRun {
  exitCode: number
  fatal: string | undefined
  /** The hint for a first-run failure Oxlint reported, if any (`hintFor`). */
  hint: string | undefined
  /** Parsed JSON output when `--format json` was requested and Oxlint produced it. */
  json: OxlintJsonOutput | undefined
}

const staticPrefix = (pattern: string): string => {
  const normalized = pattern.replace(/^\//, '').replace(/\/$/, '')
  const index = normalized.search(/[*?[{]/)

  return index === -1 ? normalized : normalized.slice(0, index)
}

/**
 * Oxlint parses every config file it meets while walking, before the config's
 * own `ignorePatterns` apply (1.87), so a stray `oxlint.config.ts` under an
 * ignored directory breaks the run. CLI patterns prune the walk, so the ignore
 * files are also forwarded as `--ignore-pattern`, rewritten relative to the
 * working directory (`rebase`), except patterns a negation could re-include
 * (the CLI has no negation; the config keeps applying both). They prune only
 * what the project ignores; a separate project inside an ignored folder is
 * linted from its own folder, where it is the root, as in an editor.
 */
export const ignoreArguments = (
  cwd: string,
  configurationDirectory: string,
  parsed: Arguments,
): string[] => {
  if (parsed.noIgnore) {
    return []
  }

  // directory patterns that hold everywhere (`**/node_modules/`) are safe from any working directory
  const everywhere = generatedIgnorePatterns.filter((pattern) => /^\*\*\/[^*]+\/$/.test(pattern))
  const below = path
    .relative(path.resolve(configurationDirectory), path.resolve(cwd))
    .split(path.sep)
    .join('/')
  const patterns = below.startsWith('..')
    ? []
    : [
        ...ignoreFilesIn(configurationDirectory).flatMap((file) => readIgnoreFile(file)),
        ...checkoutPatterns(configurationDirectory),
      ]
  const negations = patterns
    .filter((pattern) => pattern.startsWith('!'))
    .map((pattern) => pattern.slice(1).replace(/^\//, ''))

  // the config ignores the working directory itself (`fixtures/` run from `test/fixtures`)
  if (
    below !== '' &&
    negations.length === 0 &&
    ignore({ ignorecase: false }).add(patterns).ignores(`${below}/esclint-probe`)
  ) {
    return [...everywhere, '**'].flatMap((pattern) => ['--ignore-pattern', pattern])
  }
  // a negation that starts with a wildcard could re-include anything: forward no file pattern then
  const forwardable = negations.some((negation) => staticPrefix(negation) === '')
    ? []
    : patterns
        .filter((pattern) => !pattern.startsWith('!'))
        .filter((pattern) => {
          const prefix = staticPrefix(pattern)

          return (
            negations.length === 0 ||
            (prefix !== '' && !negations.some((negation) => negation.includes(prefix)))
          )
        })

  const rebased = forwardable.flatMap((pattern) => {
    const relative = rebaseIgnorePattern(pattern, below)

    return relative === undefined ? [] : [relative]
  })

  return [...new Set([...everywhere, ...rebased])].flatMap((pattern) => [
    '--ignore-pattern',
    pattern,
  ])
}

export const oxlintCommand = (binary: string, argv: readonly string[]): [string, string[]] => [
  process.execPath,
  [binary, ...argv],
]

/** `--format` as the user gave it; nothing when they did not, so Oxlint picks its own default. */
export const formatArguments = (parsed: Arguments): string[] =>
  parsed.formatExplicit ? ['--format', parsed.format] : []

export const runOxlint = async (
  cwd: string,
  configurationDirectory: string,
  parsed: Arguments,
  paths: readonly string[],
  colour: boolean,
): Promise<OxlintRun> => {
  const binary = findOxlintBinary(cwd)

  if (binary === undefined) {
    return {
      exitCode: 1,
      fatal:
        'oxlint.config file found but `oxlint` is not installed in this project; add it as a devDependency',
      hint: undefined,
      json: undefined,
    }
  }

  const argv = [
    ...parsed.forwarded,
    ...ignoreArguments(cwd, configurationDirectory, parsed),
    '--no-error-on-unmatched-pattern',
    ...formatArguments(parsed),
    // after `--`, so a path that starts with `-` stays a path
    ...(paths.length === 0 ? [] : ['--', ...paths]),
  ]
  const [command, commandArguments] = oxlintCommand(binary, argv)
  const json = parsed.format === 'json'
  const child = spawn(command, commandArguments, {
    cwd,
    env: colourEnvironment(colour),
    stdio: ['inherit', 'pipe', 'pipe'],
  })
  const collected: string[] = []
  let tail = ''
  let hint: string | undefined

  // every chunk is passed on at once; hints are looked for across chunk boundaries
  const watch = (chunk: string): void => {
    hint ??= hintFor(tail + chunk)
    tail = chunk.slice(-256)
  }

  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => {
    watch(chunk)

    if (json) {
      collected.push(chunk)
    } else {
      process.stdout.write(chunk)
    }
  })
  child.stderr.on('data', (chunk: string) => {
    watch(chunk)
    process.stderr.write(chunk)
  })

  const exit = await new Promise<number | Error>((resolve) => {
    child.on('error', resolve)
    child.on('close', (code) => {
      resolve(code ?? 1)
    })
  })

  if (exit instanceof Error) {
    return { exitCode: 1, fatal: `failed to start oxlint: ${exit.message}`, hint, json: undefined }
  }

  const stdout = collected.join('')
  const parsedJson = json ? parseJsonOutput(stdout) : undefined

  // not JSON: Oxlint failed before linting (configuration or plugin errors); show it
  if (json && parsedJson === undefined) {
    process.stderr.write(stdout)
  }

  return { exitCode: exit, fatal: undefined, hint, json: parsedJson }
}

const parseJsonOutput = (stdout: string): OxlintJsonOutput | undefined => {
  try {
    const value: unknown = JSON.parse(stdout)

    return isOxlintJsonOutput(value) ? value : undefined
  } catch {
    return undefined
  }
}

/** One actionable hint for the failures a fresh consumer hits first. */
export const hintFor = (output: string): string | undefined => {
  const text = stripVTControlCharacters(output)

  if (/Error running tsgolint|Failed to (?:find|spawn) tsgolint/.test(text)) {
    return 'esclint: type-aware linting needs `oxlint-tsgolint` installed in this project (pnpm add -D oxlint-tsgolint), or set `typeAware: false`'
  }

  // the diagnostic's code, so a file named after it does not trigger the hint
  if (text.includes('(tsconfig-error)') || text.includes('Invalid tsconfig')) {
    return 'esclint: type-aware linting reads the nearest tsconfig.json of each file with TypeScript 7, on its own and without command-line flags such as `tsc --noEmit`; fix the option named above (TypeScript 6 reports it too with `tsc -p <tsconfig>`, unless `ignoreDeprecations` hides it), or set `typeAware: false`'
  }

  return undefined
}
