/*
 * The ESLint half: the residual languages as flat-config entries. Plugin
 * objects are lazy, so a language's chunk loads only when ESLint first needs
 * one of its rules, that is, when a matching file is linted.
 */
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import type { ESLint, Linter } from 'eslint'
import { globalIgnores } from 'eslint/config'
import type { ResidualOptions } from '../../configuration/options.ts'
import type { LanguageId, RuleTable } from '../../configuration/types.ts'
import { processorMeta, residualConfiguration } from '../../generated/residual-configuration.ts'
import { isRecord } from '../../utilities/is-record.ts'
import { oxlintRunsIn } from '../../utilities/rule-engines.ts'
import { settings } from '../../configuration/settings.ts'
import { languages, readByBothEngines } from '../../configuration/languages.ts'
import { ignorePatterns as generatedIgnorePatterns } from '../../configuration/ignores.ts'
import {
  checkoutPatterns,
  configurationDirectory,
  detectLanguage,
  escapeGlob,
  frameworkOffError,
  frameworkOptions,
  gitignoreToGlob,
  ignoreFilesIn,
  inheritedIgnorePatterns,
  nestedGitignores,
  readIgnoreFile,
  rootIgnorePatterns,
  routeConsumerOverrides,
  routeConsumerRules,
  toEngineTable,
} from '../shared.ts'
import type { ResidualGroup } from './types.ts'

export interface ResidualContext {
  /** Directory of the config file: where `.lintignore`, `.gitignore` and `package.json` are read. */
  cwd: string
}

const require = createRequire(import.meta.url)
const runningFromSource = import.meta.url.endsWith('.ts')
const loaded = new Map<LanguageId, ResidualGroup>()

const isGroupModule = (exported: unknown): exported is { default: ResidualGroup } =>
  isRecord(exported) && isRecord(exported.default) && isRecord(exported.default.plugins)

const loadGroup = (language: LanguageId): ResidualGroup => {
  const cached = loaded.get(language)

  if (cached !== undefined) {
    return cached
  }

  const specifier = runningFromSource
    ? `../../generated/residual-groups/${language}.ts`
    : `./residual-groups/${language}.js`
  const exported: unknown = require(specifier)

  if (!isGroupModule(exported)) {
    throw new Error(`The ${language} residual group module exports no group`)
  }

  const group = exported.default
  loaded.set(language, group)

  return group
}

const lazyPlugins = new Map<string, ESLint.Plugin>()

/**
 * One plugin object per namespace (ESLint refuses the same namespace bound to
 * different objects across entries), whose members resolve a language chunk
 * that provides it on first access.
 */
const lazyPlugin = (language: LanguageId, namespace: string): ESLint.Plugin => {
  const existing = lazyPlugins.get(namespace)

  if (existing !== undefined) {
    return existing
  }

  const plugin: ESLint.Plugin = {
    get languages() {
      return loadGroup(language).plugins[namespace]?.languages
    },
    get processors() {
      return loadGroup(language).plugins[namespace]?.processors
    },
    get rules() {
      return loadGroup(language).plugins[namespace]?.rules
    },
  }
  lazyPlugins.set(namespace, plugin)

  return plugin
}

/**
 * Parser and parser options resolve on first read, so building the config
 * loads no language chunk; ESLint reads them only for files of that language.
 */
const lazyLanguageOptions = (language: LanguageId): Linter.LanguageOptions => {
  const options: Linter.LanguageOptions = {}
  Object.defineProperty(options, 'parser', {
    enumerable: true,
    get: () => loadGroup(language).parser,
  })
  Object.defineProperty(options, 'parserOptions', {
    enumerable: true,
    get: () => loadGroup(language).parserOptions ?? {},
  })

  return options
}

/**
 * Both engines read a `.vue` file. ESLint reads only `eslint-disable` comments
 * and Oxlint only `oxlint-disable` ones, so an `eslint-disable` comment naming
 * Oxlint's rules is in the wrong lane: Oxlint's `escapace/no-eslint-directives`
 * reports and renames it, and ESLint's own report (an unknown or unused rule)
 * would only repeat that less clearly.
 */
const QUOTED_RULE = /'([^']+)'/g
/**
 * Drops directive messages about Oxlint's rules only; for a directive that also
 * names residual rules, keeps the message but removes its fix, so ESLint never
 * deletes the names `escapace/no-eslint-directives` asks to move. A blanket
 * directive now disables ESLint's rules alone, so its report stays, but without
 * the fix: it may have been written for Oxlint's rules, and deleting it would
 * lose that.
 */
const withoutOxlintDirectives = (
  language: LanguageId,
  messages: Linter.LintMessage[],
): Linter.LintMessage[] =>
  messages.flatMap((message) => {
    // ESLint's own directive messages only; vue/comment-directive words its template reports alike
    const unknownRule = message.message.startsWith("Definition for rule '")
    const unusedDirective =
      message.ruleId === null && /^Unused eslint-(?:disable|enable) directive/.test(message.message)

    if (!unknownRule && !unusedDirective) {
      return [message]
    }

    const rules = [...message.message.matchAll(QUOTED_RULE)].map((match) => match[1] ?? '')
    const owned = rules.filter((rule) => oxlintRunsIn(language, rule))

    if (rules.length > 0 && owned.length === rules.length) {
      return []
    }

    if (owned.length > 0 || rules.length === 0) {
      const { fix: _fix, ...rest } = message

      return [rest]
    }

    return [message]
  })

/** The group's own processor wrapped to drop Oxlint's directive messages; a pass-through without one. */
const lazyProcessor = (language: LanguageId): Linter.Processor => {
  const processor = (): Linter.Processor | undefined => loadGroup(language).processor

  return {
    meta: processorMeta[language],
    postprocess: (messages, filename) =>
      withoutOxlintDirectives(
        language,
        processor()?.postprocess?.(messages, filename) ?? messages.flat(),
      ),
    preprocess: (text, filename) => processor()?.preprocess?.(text, filename) ?? [text],
    get supportsAutofix() {
      return processor()?.supportsAutofix ?? true
    },
  }
}

const namespaceOf = (id: string): string => id.slice(0, id.indexOf('/'))

const languageById = (id: LanguageId): (typeof languages)[number] => {
  const language = languages.find((candidate) => candidate.id === id)

  if (language === undefined) {
    throw new Error(`The generated residual names unknown language ${id}`)
  }

  return language
}

const pick = (rules: RuleTable, namespaces: readonly string[]): RuleTable =>
  Object.fromEntries(Object.entries(rules).filter(([id]) => namespaces.includes(namespaceOf(id))))

/** Files Oxlint alone lints: the residual never parses them (ESLint would read `.js` by default). */
const oxlintOnlyFiles = languages
  .filter(
    (language) => !residualConfiguration.languages.some((residual) => residual.id === language.id),
  )
  .flatMap((language) => language.files)

export const createEslintConfiguration = (
  options: ResidualOptions = {},
  context?: ResidualContext,
): Linter.Config[] => {
  // the config's own folder unless a caller says otherwise (tests)
  const cwd = context?.cwd ?? configurationDirectory('eslint')
  const consumerRules = toEngineTable(routeConsumerRules(options.rules, 'eslint'))
  const consumerOverrides = routeConsumerOverrides(options.overrides, 'eslint')
  const consumerIds = [
    ...Object.keys(consumerRules),
    ...consumerOverrides.flatMap((override) => Object.keys(override.rules)),
  ]
  const enabled: typeof residualConfiguration.languages = []
  const own = new Map<LanguageId, { files: string[]; rules: RuleTable }>()

  for (const language of residualConfiguration.languages) {
    const definition = languageById(language.id)
    const framework = frameworkOptions(options, definition)
    const rules = toEngineTable(routeConsumerRules(framework?.rules, 'eslint'))

    if (detectLanguage(cwd, definition, framework?.enabled)) {
      enabled.push(language)
      own.set(language.id, { files: framework?.files ?? language.files, rules })
    } else if (definition.detect !== undefined) {
      // a rule only this language's plugins provide cannot run anywhere else
      const elsewhere = new Set(
        residualConfiguration.languages
          .filter((other) => other.id !== language.id)
          .flatMap((other) => other.plugins),
      )
      const stray = consumerIds.find(
        (id) => language.plugins.includes(namespaceOf(id)) && !elsewhere.has(namespaceOf(id)),
      )

      if (Object.keys(rules).length > 0 || stray !== undefined) {
        throw frameworkOffError(
          definition.detect,
          stray === undefined ? `\`${definition.detect.id}.rules\`` : `Rule "${stray}"`,
        )
      }
    }
  }

  const filesOf = (language: (typeof enabled)[number]): string[] =>
    own.get(language.id)?.files ?? language.files

  // `ignorePatterns` and every ignore file use .gitignore semantics, as in Oxlint; a package
  // config also takes the ignore files of the project above it
  const inherited = inheritedIgnorePatterns(cwd)
  const configs: Linter.Config[] = [
    globalIgnores(
      [
        ...generatedIgnorePatterns,
        ...oxlintOnlyFiles,
        ...checkoutPatterns(cwd).map((pattern) => gitignoreToGlob(pattern)),
        ...inherited.map((pattern) => gitignoreToGlob(pattern)),
        ...(options.ignorePatterns ?? []).map((pattern) => gitignoreToGlob(pattern)),
      ],
      'escapace/ignores',
    ),
  ]
  const rootIgnoreFiles = [...ignoreFilesIn(cwd), path.join(cwd, '.gitignore')].filter((file) =>
    existsSync(file),
  )
  const rootPatterns = rootIgnorePatterns(cwd, [...inherited, ...(options.ignorePatterns ?? [])])

  for (const file of [...rootIgnoreFiles, ...nestedGitignores(cwd, rootPatterns)]) {
    const relative = path.relative(cwd, path.dirname(file))
    const prefix = relative === '' ? '' : `${escapeGlob(relative.split(path.sep).join('/'))}/`
    const patterns = readIgnoreFile(file).map((pattern) => gitignoreToGlob(pattern, prefix))

    if (patterns.length > 0) {
      configs.push(
        globalIgnores(patterns, `escapace/${path.relative(cwd, file).split(path.sep).join('/')}`),
      )
    }
  }

  for (const language of enabled) {
    const entry: Linter.Config = {
      files: filesOf(language),
      name: `escapace/${language.id}`,
      plugins: Object.fromEntries(
        language.plugins.map((namespace) => [namespace, lazyPlugin(language.id, namespace)]),
      ),
      rules: { ...language.rules },
      settings,
    }

    if (language.provider.kind === 'language') {
      entry.language = language.provider.language
    } else {
      entry.languageOptions = lazyLanguageOptions(language.id)

      if (readByBothEngines(languageById(language.id))) {
        entry.processor = lazyProcessor(language.id)
      }
    }

    configs.push(entry)
  }

  for (const override of residualConfiguration.overrides) {
    if (enabled.some((language) => language.id === override.language)) {
      configs.push({
        files: override.files,
        name: `escapace/${override.name}`,
        rules: override.rules,
      })
    }
  }

  // consumer rules come after the generated groups, so they win everywhere
  for (const language of enabled) {
    const rules = {
      ...pick(consumerRules, language.plugins),
      ...own.get(language.id)?.rules,
    }

    if (Object.keys(rules).length > 0) {
      configs.push({ files: filesOf(language), name: `escapace/rules/${language.id}`, rules })
    }
  }

  // a consumer override applies per language that registers its rules' plugins, so a glob that
  // spans YAML and JSON never asks a JSON file for a YAML rule
  for (const [index, override] of consumerOverrides.entries()) {
    for (const language of enabled) {
      const rules = pick(override.rules, language.plugins)

      if (Object.keys(rules).length === 0) {
        continue
      }

      configs.push({
        files: override.files.flatMap((glob) =>
          filesOf(language).map((languageGlob) => [glob, languageGlob]),
        ),
        ...(override.excludeFiles === undefined ? {} : { ignores: override.excludeFiles }),
        name: `escapace/overrides/${index}/${language.id}`,
        rules,
      })
    }
  }

  return configs
}
