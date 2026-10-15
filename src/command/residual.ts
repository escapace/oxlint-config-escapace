/*
 * Runs the residual with the consumer's ESLint (resolved from the project,
 * never from this package) against the consumer's eslint.config file.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { ESLint as ESLintClass, Linter } from 'eslint'
import { escapeGlob, gitignoreToGlob } from '../engines/shared.ts'
import { residualConfiguration } from '../generated/residual-configuration.ts'
import { ruleIndex } from '../generated/rule-index.ts'
import { normalizeRuleKey } from '../utilities/normalize-rules.ts'
import type { Arguments } from './arguments.ts'
import type { Diagnostic } from './renderers/diagnostic.ts'
import { toOxlintCode } from './renderers/diagnostic.ts'
import { isRecord } from '../utilities/is-record.ts'
import { loadProjectEslint, loadProjectEslintConfig, resolveFromProject } from './presence.ts'

export interface ResidualRun {
  diagnostics: Diagnostic[]
  errorCount: number
  fatal: string | undefined
  files: string[]
  milliseconds: number
  warningCount: number
}

type Severity = 'error' | 'off' | 'warn'

/** `-A/-W/-D` targets that name a residual rule, by ESLint rule id; aliases accepted. */
const residualSeverities = (overrides: Arguments['severityOverrides']): Map<string, Severity> => {
  const result = new Map<string, Severity>()

  for (const [severity, target] of overrides) {
    const canonical = target.includes('/') ? normalizeRuleKey(target) : undefined
    const entry = canonical === undefined ? undefined : ruleIndex[canonical]
    const placement =
      entry?.engine === 'eslint'
        ? entry
        : entry?.secondary?.engine === 'eslint'
          ? entry.secondary
          : undefined

    if (placement !== undefined) {
      result.set(placement.engineId, severity)
    }
  }

  return result
}

/** A file name the language's first glob matches (`**\/*.{yml,yaml}` → `esclint.yml`). */
const sampleFile = (glob: string): string =>
  glob
    .slice(glob.lastIndexOf('/') + 1)
    .replaceAll(/\{([^,}]*)(?:,[^}]*)?\}/g, '$1')
    .replaceAll('*', 'esclint')

/**
 * One override entry per residual language that the consumer's config actually
 * registers the rule's plugin for, so a severity flag never reaches a file
 * whose config lacks the plugin (ESLint would reject the whole run).
 */
const severityEntries = async (
  eslint: ESLintClass,
  cwd: string,
  severities: ReadonlyMap<string, Severity>,
): Promise<Linter.Config[]> => {
  const entries: Linter.Config[] = []

  for (const language of residualConfiguration.languages) {
    const rules: Linter.RulesRecord = {}

    for (const [id, severity] of severities) {
      if (language.plugins.includes(id.slice(0, id.indexOf('/')))) {
        rules[id] = severity
      }
    }

    if (Object.keys(rules).length === 0) {
      continue
    }

    const sample = path.join(cwd, sampleFile(language.files[0] ?? ''))
    const config: unknown = await eslint.calculateConfigForFile(sample)
    const registered =
      isRecord(config) && isRecord(config.plugins) ? Object.keys(config.plugins) : []

    if (Object.keys(rules).every((id) => registered.includes(id.slice(0, id.indexOf('/'))))) {
      entries.push({ files: language.files, name: `esclint/severity/${language.id}`, rules })
    }
  }

  return entries
}

/**
 * `--ignore-pattern` as Oxlint reads it, gitignore-style from the working
 * directory, rewritten for ESLint, which anchors patterns at the config's folder.
 */
const ignorePatternGlobs = (
  cwd: string,
  configurationDirectory: string,
  patterns: readonly string[],
): string[] => {
  const below = path.relative(configurationDirectory, cwd).split(path.sep).join('/')
  const prefix = below === '' ? '' : `${escapeGlob(below)}/`

  return patterns.map((pattern) => gitignoreToGlob(pattern, prefix))
}

/** Offsets of each line's start, for the `offset` and `length` of JSON diagnostics. */
const lineStarts = (text: string): number[] => {
  const starts = [0]

  for (let index = text.indexOf('\n'); index !== -1; index = text.indexOf('\n', index + 1)) {
    starts.push(index + 1)
  }

  return starts
}

const offsetOf = (starts: readonly number[], line: number, column: number): number | undefined => {
  const start = starts[line - 1]

  return start === undefined ? undefined : start + column - 1
}

const sourceOf = (result: ESLintClass.LintResult): string | undefined => {
  if (result.output !== undefined) {
    return result.output
  }

  if (result.source !== undefined) {
    return result.source
  }

  try {
    return readFileSync(result.filePath, 'utf8')
  } catch {
    return undefined
  }
}

export const runResidual = async (
  cwd: string,
  configurationDirectory: string,
  arguments_: Arguments,
  paths: readonly string[],
): Promise<ResidualRun> => {
  const started = performance.now()
  const failure = (fatal: string): ResidualRun => ({
    diagnostics: [],
    errorCount: 0,
    fatal,
    files: [],
    milliseconds: performance.now() - started,
    warningCount: 0,
  })

  if (resolveFromProject(cwd, 'eslint') === undefined) {
    return failure(
      'eslint.config file found but `eslint` is not installed in this project; add it as a devDependency',
    )
  }

  // any failure of ESLint's half is a message, never a stack trace, and keeps Oxlint's results
  try {
    return await lintResidual(cwd, configurationDirectory, arguments_, paths, started)
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error))
  }
}

const lintResidual = async (
  cwd: string,
  configurationDirectory: string,
  arguments_: Arguments,
  paths: readonly string[],
  started: number,
): Promise<ResidualRun> => {
  const { ESLint } = loadProjectEslint(cwd)
  const overrideConfig: Linter.Config[] = []

  // --no-ignore drops only the CLI patterns; the config's ignores always apply, as in Oxlint
  if (
    !arguments_.noIgnore &&
    (arguments_.ignorePatterns.length > 0 || arguments_.ignorePath !== undefined)
  ) {
    const { globalIgnores, includeIgnoreFile } = loadProjectEslintConfig(cwd)

    if (arguments_.ignorePatterns.length > 0) {
      overrideConfig.push(
        globalIgnores(
          ignorePatternGlobs(cwd, configurationDirectory, arguments_.ignorePatterns),
          'esclint/ignore-pattern',
        ),
      )
    }

    if (arguments_.ignorePath !== undefined) {
      overrideConfig.push(
        includeIgnoreFile(path.resolve(cwd, arguments_.ignorePath), 'esclint/ignore-path'),
      )
    }
  }

  const options = {
    cwd,
    errorOnUnmatchedPattern: false,
    fix: arguments_.fix && !arguments_.debugFiles,
    globInputPaths: false,
    warnIgnored: false,
  }

  const severities = residualSeverities(arguments_.severityOverrides)

  if (severities.size > 0) {
    overrideConfig.push(...(await severityEntries(new ESLint(options), cwd, severities)))
  }

  if (arguments_.reportUnusedDisableDirectives !== undefined) {
    overrideConfig.push({
      linterOptions: { reportUnusedDisableDirectives: arguments_.reportUnusedDisableDirectives },
    })
  }

  const eslint = new ESLint({
    ...options,
    ...(overrideConfig.length === 0 ? {} : { overrideConfig }),
  })
  const results = await eslint.lintFiles(paths.length === 0 ? ['.'] : [...paths])
  const files = results.map((result) => result.filePath)
  const run = {
    diagnostics: [] as Diagnostic[],
    errorCount: 0,
    fatal: undefined,
    files,
    milliseconds: 0,
    warningCount: 0,
  }

  if (arguments_.debugFiles) {
    return { ...run, milliseconds: performance.now() - started }
  }

  if (arguments_.fix) {
    await ESLint.outputFixes(results)
  }

  for (const result of results) {
    const text = result.messages.length === 0 ? undefined : sourceOf(result)
    const starts = text === undefined ? undefined : lineStarts(text)

    for (const message of result.messages) {
      // thresholds count every warning, as Oxlint does; --quiet only hides them
      if (message.severity === 2) {
        run.errorCount += 1
      } else {
        run.warningCount += 1

        if (arguments_.quiet) {
          continue
        }
      }

      const offset =
        starts === undefined ? undefined : offsetOf(starts, message.line, message.column)
      const end =
        starts === undefined || message.endLine === undefined || message.endColumn === undefined
          ? undefined
          : offsetOf(starts, message.endLine, message.endColumn)

      run.diagnostics.push({
        code: message.fatal === true ? undefined : toOxlintCode(message.ruleId),
        column: message.column,
        endColumn: message.endColumn,
        endLine: message.endLine,
        filename: result.filePath,
        help: undefined,
        length: offset === undefined || end === undefined ? undefined : Math.max(0, end - offset),
        line: message.line,
        message: message.message,
        offset,
        severity: message.severity === 2 ? 'error' : 'warning',
      })
    }
  }

  return { ...run, milliseconds: performance.now() - started }
}
