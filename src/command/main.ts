#!/usr/bin/env node
/*
 * esclint: one command over Oxlint and the ESLint residual.
 * Each config file is the presence flag for its engine; Oxlint's CLI is the
 * contract and the residual conforms to it.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import module from 'node:module'
import path from 'node:path'
import features from '../generated/capabilities/features.json' with { type: 'json' }
import type { Arguments } from './arguments.ts'
import { parseArguments, RESIDUAL_FORMATS } from './arguments.ts'
import { colourEnvironment, wantsColour } from './colour.ts'
import { formatArguments, ignoreArguments, oxlintCommand, runOxlint } from './oxlint.ts'
import { partitionPaths, residualExtensions } from './partition.ts'
import type { EnginePresence } from './presence.ts'
import {
  detectPresence,
  findOxlintBinary,
  installedVersion,
  loadProjectEslint,
  resolveFromProject,
} from './presence.ts'
import type { OxlintJsonOutput } from './renderers/render.ts'
import {
  renderGithub,
  renderStylish,
  renderUnix,
  toOxlintJsonDiagnostic,
} from './renderers/render.ts'
import { projectRootProblem } from '../engines/shared.ts'
import { packageVersion } from '../utilities/read-json.ts'
import { runResidual } from './residual.ts'

const version = packageVersion(new URL('../../package.json', import.meta.url)) ?? 'unknown'

const HELP_APPENDIX = `
esclint (oxlint-config-escapace ${version})
  Runs oxlint when oxlint.config.ts exists and the ESLint residual (YAML, JSON,
  TOML, Vue and Astro templates) when eslint.config.mjs exists. Every flag above is
  forwarded to oxlint; --fix, --quiet, --silent, --max-warnings,
  --deny-warnings, -A/-W/-D, --ignore-pattern, --ignore-path, --no-ignore,
  --report-unused-disable-directives and --format (default, stylish, json,
  github, unix) also apply to the residual. --no-error-on-unmatched-pattern is
  always on. The exit code is the maximum of the two engines.

  --color, --no-color
                  colour both engines' output, or neither; by default FORCE_COLOR,
                  NO_COLOR and a terminal on stdout decide, as for Node and ESLint

  --init          refused: Oxlint's would write an .oxlintrc.json that competes with
                  oxlint.config.ts; write the two config files by hand
  --print-config  print both engines' resolved configuration
`

const compareVersions = (left: string, right: string): number => {
  const a = left.split('.').map(Number)
  const b = right.split('.').map(Number)

  for (let index = 0; index < 3; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0)

    if (difference !== 0) {
      return difference
    }
  }

  return 0
}

const log = (line: string): void => {
  process.stderr.write(`${line}\n`)
}

/** One line when the installed engines are older than the ones the tables were generated against. */
const driftNotice = (cwd: string): void => {
  const oxlint = installedVersion(cwd, 'oxlint')
  const tsgolint = installedVersion(cwd, 'oxlint-tsgolint')
  const stale =
    (oxlint !== undefined && compareVersions(oxlint, features.oxlintVersion) < 0) ||
    (tsgolint !== undefined && compareVersions(tsgolint, features.tsgolintVersion) < 0)

  if (stale) {
    log(
      `esclint: installed oxlint ${oxlint ?? '-'} / oxlint-tsgolint ${tsgolint ?? '-'} are older than the ${features.oxlintVersion} / ${features.tsgolintVersion} these rules target; run: pnpm add -D oxlint@${features.oxlintVersion} oxlint-tsgolint@${features.tsgolintVersion}`,
    )
  }
}

const printConfig = async (
  cwd: string,
  parsed: Arguments,
  presence: EnginePresence,
): Promise<number> => {
  let code = 0

  if (presence.oxlintConfig !== undefined) {
    const binary = findOxlintBinary(cwd)

    if (binary === undefined) {
      log('esclint: oxlint is not installed in this project')
      code = 1
    } else {
      const [command, commandArguments] = oxlintCommand(binary, [
        ...parsed.forwarded,
        ...ignoreArguments(cwd, path.dirname(presence.oxlintConfig), parsed),
        '--print-config',
        '--no-error-on-unmatched-pattern',
        ...parsed.paths,
      ])
      const result = spawnSync(command, commandArguments, {
        cwd,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      })
      process.stdout.write('// oxlint\n')
      process.stdout.write(result.stdout)
      process.stderr.write(result.stderr)
      code = Math.max(code, result.status ?? 1)
    }
  }

  if (presence.eslintConfig !== undefined) {
    if (resolveFromProject(cwd, 'eslint') === undefined) {
      log('esclint: eslint is not installed in this project')

      return 1
    }

    const file =
      parsed.paths.find((candidate) => residualExtensions.has(path.extname(candidate))) ??
      'package.json'
    let configuration: unknown

    try {
      const { ESLint } = loadProjectEslint(cwd)
      configuration = await new ESLint({ cwd }).calculateConfigForFile(path.resolve(cwd, file))
    } catch (error) {
      log(`esclint: ${error instanceof Error ? error.message : String(error)}`)

      return 1
    }

    process.stdout.write(`// eslint residual (${file})\n`)
    process.stdout.write(
      configuration === undefined
        ? `// ${file} is ignored\n`
        : `${JSON.stringify(
            configuration,
            (_key, value: unknown) =>
              typeof value === 'function' ? `[function ${value.name}]` : value,
            2,
          )}\n`,
    )
  }

  return code
}

const execOxlint = (cwd: string, parsed: Arguments): number => {
  const binary = findOxlintBinary(cwd)

  if (binary === undefined) {
    log('esclint: oxlint is not installed in this project')

    return 1
  }

  const [command, commandArguments] = oxlintCommand(binary, [
    ...parsed.forwarded,
    ...formatArguments(parsed),
  ])

  return (
    spawnSync(command, commandArguments, {
      cwd,
      env: colourEnvironment(wantsColour(parsed.color)),
      stdio: 'inherit',
    }).status ?? 1
  )
}

/**
 * Whether the command line asks for JSON output, read from the raw arguments
 * so that it holds when they fail to parse.
 */
const requestsJson = (argv: readonly string[]): boolean => {
  let format: string | undefined

  for (const [index, argument] of argv.entries()) {
    const equals = argument.indexOf('=')
    const name = equals === -1 ? argument : argument.slice(0, equals)

    if (name === '--format' || name === '-f') {
      format = equals === -1 ? argv[index + 1] : argument.slice(equals + 1)
    }
  }

  return format === 'json' && !argv.includes('--silent')
}

/** A JSON run that fails before linting still prints one document, so stdout always parses. */
const writeEmptyJson = (): void => {
  const empty: OxlintJsonOutput = { diagnostics: [], number_of_files: 0, number_of_rules: 0 }
  process.stdout.write(`${JSON.stringify(empty)}\n`)
}

const main = async (): Promise<number> => {
  const cwd = process.cwd()
  let parsed: Arguments

  try {
    parsed = parseArguments(process.argv.slice(2))
  } catch (error) {
    log(`esclint: ${error instanceof Error ? error.message : String(error)}`)

    if (requestsJson(process.argv.slice(2))) {
      writeEmptyJson()
    }

    return 1
  }

  if (parsed.version) {
    process.stdout.write(
      [
        `esclint ${version} (oxlint-config-escapace, rules generated against oxlint ${features.oxlintVersion})`,
        `oxlint ${installedVersion(cwd, 'oxlint') ?? 'not installed'}`,
        `oxlint-tsgolint ${installedVersion(cwd, 'oxlint-tsgolint') ?? 'not installed'}`,
        `eslint ${installedVersion(cwd, 'eslint') ?? 'not installed'}`,
        '',
      ].join('\n'),
    )

    return 0
  }

  if (parsed.help) {
    const binary = findOxlintBinary(cwd)

    if (binary !== undefined) {
      const [command, commandArguments] = oxlintCommand(binary, ['--help'])
      process.stdout.write(spawnSync(command, commandArguments, { cwd, encoding: 'utf8' }).stdout)
    }

    process.stdout.write(HELP_APPENDIX)

    return 0
  }

  // Oxlint-only commands need no config file
  if (parsed.exec) {
    return execOxlint(cwd, parsed)
  }

  const presence = detectPresence(cwd, parsed.configPath)

  if (presence.oxlintConfig === undefined && presence.eslintConfig === undefined) {
    log(
      'esclint: no oxlint.config.ts or eslint.config.mjs found at or above the working directory; see the README for the two-line files',
    )

    if (parsed.format === 'json' && !parsed.silent && !parsed.printConfig) {
      writeEmptyJson()
    }

    return 1
  }

  if (parsed.printConfig) {
    return await printConfig(cwd, parsed, presence)
  }

  const json = parsed.format === 'json'
  const colour = wantsColour(parsed.color)
  const chatty = !parsed.silent && !parsed.quiet
  const partition = parsed.paths.length === 0 ? undefined : partitionPaths(cwd, parsed.paths)
  const runsOxlint =
    presence.oxlintConfig !== undefined && (partition === undefined || partition.oxlint.length > 0)
  const runsResidual =
    presence.eslintConfig !== undefined &&
    (partition === undefined || partition.residual.length > 0)

  if (runsResidual && !RESIDUAL_FORMATS.includes(parsed.format)) {
    log(
      `esclint: --format ${parsed.format} is Oxlint-only; the residual supports ${RESIDUAL_FORMATS.join(', ')}`,
    )

    return 1
  }

  // Oxlint accepts a missing ignore file and ESLint fails on it; a typo should fail both
  if (parsed.ignorePath !== undefined && !existsSync(path.resolve(cwd, parsed.ignorePath))) {
    log(`esclint: --ignore-path ${parsed.ignorePath} does not exist`)

    if (json && !parsed.silent) {
      writeEmptyJson()
    }

    return 1
  }

  if (chatty && presence.oxlintConfig !== undefined) {
    driftNotice(cwd)
  }

  if (parsed.debugFiles) {
    log(
      `esclint: oxlint ${presence.oxlintConfig === undefined ? 'skipped (no oxlint.config.ts)' : `via ${presence.oxlintConfig}`}`,
    )
    log(
      `esclint: eslint ${presence.eslintConfig === undefined ? 'skipped (no eslint.config.mjs)' : `via ${presence.eslintConfig}`}`,
    )
  }

  let code = 0
  let oxlintJson: OxlintJsonOutput | undefined

  if (runsOxlint && presence.oxlintConfig !== undefined) {
    // the config's own check, before Oxlint: with every file git-ignored Oxlint never loads it
    const problem = projectRootProblem(
      path.dirname(presence.oxlintConfig),
      path.basename(presence.oxlintConfig),
    )
    const result =
      problem === undefined
        ? await runOxlint(
            cwd,
            path.dirname(presence.oxlintConfig),
            parsed,
            partition?.oxlint ?? [],
            colour,
          )
        : { exitCode: 1, fatal: problem, hint: undefined, json: undefined }

    if (result.fatal === undefined) {
      if (result.hint !== undefined && !parsed.silent) {
        log(result.hint)
      }

      oxlintJson = result.json
      code = Math.max(code, result.exitCode)
    } else {
      log(`esclint: ${result.fatal}`)
      code = 1
    }
  }

  const residualDiagnostics: Array<Parameters<typeof renderStylish>[1][number]> = []
  let residualFiles = 0

  if (runsResidual) {
    const residual = await runResidual(
      cwd,
      path.dirname(presence.eslintConfig ?? path.join(cwd, 'eslint.config.mjs')),
      parsed,
      partition?.residual ?? [],
    )

    if (residual.fatal !== undefined) {
      log(`esclint: ${residual.fatal}`)
      code = 1
    } else if (parsed.debugFiles) {
      // stderr under JSON, so stdout stays one document
      const stream = json ? process.stderr : process.stdout

      for (const file of residual.files) {
        stream.write(`${path.relative(cwd, file)}\n`)
      }

      log(`esclint: eslint would lint ${residual.files.length} files`)
    } else {
      const failed =
        residual.errorCount > 0 ||
        (parsed.denyWarnings && residual.warningCount > 0) ||
        (parsed.maxWarnings !== undefined && residual.warningCount > parsed.maxWarnings)
      code = Math.max(code, failed ? 1 : 0)
      residualDiagnostics.push(...residual.diagnostics)
      residualFiles = residual.files.length

      if (!parsed.silent && !json) {
        if (parsed.format === 'github') {
          process.stdout.write(renderGithub(cwd, residual.diagnostics))
        } else if (parsed.format === 'unix') {
          process.stdout.write(renderUnix(cwd, residual.diagnostics))
        } else {
          process.stdout.write(renderStylish(cwd, residual.diagnostics, colour))

          if (!parsed.quiet) {
            log(
              `eslint: Found ${residual.warningCount} warnings and ${residual.errorCount} errors. Finished in ${residual.milliseconds.toFixed(0)}ms on ${residual.files.length} files.`,
            )
          }
        }
      }
    }
  }

  // always one JSON document, even when an engine failed or no path matched either engine;
  // the earlier failures write an empty one (`writeEmptyJson`)
  if (json && !parsed.silent) {
    const merged: OxlintJsonOutput = oxlintJson ?? {
      diagnostics: [],
      number_of_files: 0,
      number_of_rules: 0,
    }
    merged.diagnostics.push(
      ...residualDiagnostics.map((diagnostic) => toOxlintJsonDiagnostic(cwd, diagnostic)),
    )
    merged.number_of_files += residualFiles
    process.stdout.write(`${JSON.stringify(merged)}\n`)
  }

  return code
}

// V8 keeps the bytecode of the modules loaded from here on between runs, as ESLint's own command
// line does: a residual group and the TypeScript it bundles load in about half the time. Oxlint,
// which loads the JS plugins in a process of its own, gets the same cache through the environment.
const compileCache = module.enableCompileCache()

if (compileCache.directory !== undefined) {
  process.env.NODE_COMPILE_CACHE ??= compileCache.directory
}

// a reader that stops early (`esclint | head`) closes the pipe; that is not a failure of the run
process.stdout.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code !== 'EPIPE') {
    throw error
  }

  process.exit(process.exitCode ?? 0)
})

main().then(
  (code) => {
    process.exitCode = code
  },
  (error: unknown) => {
    log(`esclint: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`)

    // the document is written last, so a failure here means none was written
    if (requestsJson(process.argv.slice(2))) {
      writeEmptyJson()
    }

    process.exitCode = 1
  },
)
