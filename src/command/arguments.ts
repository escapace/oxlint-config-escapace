export interface Arguments {
  /** `--color` or `--no-color`; undefined leaves the decision to the environment. */
  color: boolean | undefined
  configPath: string | undefined
  denyWarnings: boolean
  /** Oxlint-only commands the bin delegates entirely (`--rules`, `--lsp`). */
  exec: boolean
  fix: boolean
  format: Format
  /** Whether `--format` was given; an explicit `default` is forwarded too (agent environments change Oxlint's default). */
  formatExplicit: boolean
  /** Everything to pass to Oxlint, including the interpreted flags it understands. */
  forwarded: string[]
  help: boolean
  ignorePath: string | undefined
  ignorePatterns: string[]
  maxWarnings: number | undefined
  noIgnore: boolean
  paths: string[]
  printConfig: boolean
  quiet: boolean
  reportUnusedDisableDirectives: 'error' | 'off' | 'warn' | undefined
  /** `-A`, `-W`, `-D` entries in order: [severity, rule or category]. */
  debugFiles: boolean
  severityOverrides: Array<['error' | 'off' | 'warn', string]>
  silent: boolean
  version: boolean
}

/*
 * The interpreted subset of Oxlint's CLI. Everything not listed
 * here is forwarded to Oxlint verbatim.
 */
// Oxlint's output formats (`oxlint --help`)
const FORMATS = [
  'agent',
  'checkstyle',
  'default',
  'github',
  'gitlab',
  'json',
  'junit',
  'sarif',
  'stylish',
  'unix',
] as const

export type Format = (typeof FORMATS)[number]

const isFormat = (value: string): value is Format => FORMATS.some((format) => format === value)

// `--report-unused-disable-directives-severity` values; Oxlint rejects any other itself
const DIRECTIVE_SEVERITIES: Record<string, 'error' | 'off' | 'warn'> = {
  allow: 'off',
  deny: 'error',
  error: 'error',
  off: 'off',
  warn: 'warn',
}

/** Short flags that take a value, which may also be attached (`-fjson`, `-Ayaml/sort-keys`), as Oxlint accepts. */
const SHORT_VALUE_FLAGS = new Set(['-A', '-c', '-D', '-f', '-W'])

const SEVERITY_FLAGS: Record<string, 'error' | 'off' | 'warn'> = {
  '--allow': 'off',
  '--deny': 'error',
  '--warn': 'warn',
  '-A': 'off',
  '-D': 'error',
  '-W': 'warn',
}

export const parseArguments = (argv: readonly string[]): Arguments => {
  const result: Arguments = {
    color: undefined,
    configPath: undefined,
    debugFiles: false,
    denyWarnings: false,
    exec: false,
    fix: false,
    format: 'default',
    formatExplicit: false,
    forwarded: [],
    help: false,
    ignorePath: undefined,
    ignorePatterns: [],
    maxWarnings: undefined,
    noIgnore: false,
    paths: [],
    printConfig: false,
    quiet: false,
    reportUnusedDisableDirectives: undefined,
    severityOverrides: [],
    silent: false,
    version: false,
  }

  const take = (index: number, flag: string): [value: string, next: number] => {
    const inline = argv[index]?.indexOf('=') ?? -1
    const current = argv[index] ?? ''

    if (inline !== -1 && current.startsWith('-')) {
      return [current.slice(inline + 1), index + 1]
    }

    if (SHORT_VALUE_FLAGS.has(flag) && current.length > flag.length) {
      return [current.slice(flag.length), index + 1]
    }

    const value = argv[index + 1]

    if (value === undefined) {
      throw new Error(`${flag} expects a value`)
    }

    return [value, index + 2]
  }

  let index = 0

  while (index < argv.length) {
    const argument = argv[index] ?? ''
    const short = argument.slice(0, 2)
    const name =
      argument.includes('=') && argument.startsWith('-')
        ? argument.slice(0, argument.indexOf('='))
        : SHORT_VALUE_FLAGS.has(short) && !argument.startsWith('--')
          ? short
          : argument

    // pnpm passes `--` on (`pnpm lint -- --fix` runs `esclint -- --fix`), so it is dropped and
    // the flags after it still count; a file named with a leading `-` is passed as `./-file`
    if (argument === '--') {
      index += 1
      continue
    }

    switch (name) {
      case '--allow':
      case '--deny':
      case '--warn':
      case '-A':
      case '-D':
      case '-W': {
        const [value, next] = take(index, name)
        result.severityOverrides.push([SEVERITY_FLAGS[name] ?? 'warn', value])
        result.forwarded.push(name, value)
        index = next
        break
      }
      // ESLint's colour flags; Oxlint has none, so they reach it as environment variables
      case '--color':
      case '--no-color':
        result.color = name === '--color'
        index += 1
        break
      case '--config':
      case '-c': {
        const [value, next] = take(index, name)
        result.configPath = value
        result.forwarded.push('--config', value)
        index = next
        break
      }
      case '--debug': {
        const [value, next] = take(index, name)
        result.debugFiles = value.split(',').includes('files')
        result.forwarded.push('--debug', value)
        index = next
        break
      }
      case '--deny-warnings':
        result.denyWarnings = true
        result.forwarded.push(argument)
        index += 1
        break
      case '--fix':
      case '--fix-dangerously':
      case '--fix-suggestions':
        result.fix = true
        result.forwarded.push(argument)
        index += 1
        break
      case '--format':
      case '-f': {
        const [value, next] = take(index, name)

        if (!isFormat(value)) {
          throw new Error(`--format ${value} is not one of ${FORMATS.join(', ')}`)
        }

        result.format = value
        result.formatExplicit = true
        index = next
        break
      }
      case '--help':
      case '-h':
        result.help = true
        index += 1
        break
      case '--ignore-path': {
        const [value, next] = take(index, name)
        result.ignorePath = value
        result.forwarded.push('--ignore-path', value)
        index = next
        break
      }
      case '--ignore-pattern': {
        const [value, next] = take(index, name)
        result.ignorePatterns.push(value)
        result.forwarded.push('--ignore-pattern', value)
        index = next
        break
      }
      // forwarded, Oxlint's own --init would write an .oxlintrc.json that competes with oxlint.config.ts
      case '--init':
        throw new Error(
          '--init is not supported: write oxlint.config.ts and eslint.config.mjs as the README shows',
        )
      case '--lsp':
      case '--rules':
        result.exec = true
        result.forwarded.push(argument)
        index += 1
        break
      case '--max-warnings': {
        const [value, next] = take(index, name)

        if (!/^\d+$/.test(value)) {
          throw new Error(`--max-warnings expects a whole number, not ${value}`)
        }

        result.maxWarnings = Number(value)
        result.forwarded.push('--max-warnings', value)
        index = next
        break
      }
      case '--no-error-on-unmatched-pattern':
        index += 1
        break
      case '--no-ignore':
        result.noIgnore = true
        result.forwarded.push(argument)
        index += 1
        break
      case '--print-config':
        result.printConfig = true
        index += 1
        break
      case '--quiet':
        result.quiet = true
        result.forwarded.push(argument)
        index += 1
        break
      case '--report-unused-disable-directives':
        result.reportUnusedDisableDirectives = 'warn'
        result.forwarded.push(argument)
        index += 1
        break
      case '--report-unused-disable-directives-severity': {
        const [value, next] = take(index, name)
        result.reportUnusedDisableDirectives = DIRECTIVE_SEVERITIES[value]
        result.forwarded.push('--report-unused-disable-directives-severity', value)
        index = next
        break
      }
      case '--silent':
        result.silent = true
        result.forwarded.push(argument)
        index += 1
        break
      case '--version':
      case '-V':
        result.version = true
        index += 1
        break
      default:
        if (argument.startsWith('-')) {
          // Oxlint-only flag; value flags of Oxlint use `--flag=value` or a following token we cannot
          // distinguish from a path, so we forward `--flag value` pairs for the known value flags.
          if (['--threads', '--tsconfig'].includes(name) && !argument.includes('=')) {
            const [value, next] = take(index, name)
            result.forwarded.push(name, value)
            index = next
          } else {
            result.forwarded.push(argument)
            index += 1
          }
        } else {
          result.paths.push(argument)
          index += 1
        }
    }
  }

  return result
}

export const RESIDUAL_FORMATS: readonly Format[] = ['default', 'github', 'json', 'stylish', 'unix']
