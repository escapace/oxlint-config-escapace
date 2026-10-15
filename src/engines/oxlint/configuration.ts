/*
 * The Oxlint half: merges consumer options into the generated configuration.
 * Everything static was computed by codegen; this only touches what depends
 * on the consumer's project.
 */
import { fileURLToPath } from 'node:url'
import type { OxlintConfig } from 'oxlint'
import { isNativePlugin, type NativePlugin } from '../../capabilities/native-plugins.ts'
import type { Options } from '../../configuration/options.ts'
import { languages } from '../../configuration/languages.ts'
import type { RuleEntry, RuleTable } from '../../configuration/types.ts'
import { oxlintConfiguration } from '../../generated/oxlint-configuration.ts'
import {
  assertProjectRoot,
  collectIgnorePatterns,
  ConfigurationError,
  configurationDirectory,
  detectLanguage,
  frameworkName,
  frameworkOffError,
  frameworkOptions,
  isRootConfiguration,
  routeConsumerOverrides,
  routeConsumerRules,
  toEngineTable,
} from '../shared.ts'

export interface OxlintContext {
  /** Directory of the config file: where `.lintignore` and `package.json` are read. */
  cwd: string
}

const runningFromSource = import.meta.url.endsWith('.ts')

/** Absolute path of a plugin shim: the TypeScript source in development, the bundled file once built. */
const pluginSpecifier = (shim: string): string =>
  runningFromSource
    ? fileURLToPath(new URL(`./plugins/${shim}.ts`, import.meta.url))
    : fileURLToPath(new URL(`./plugins/${shim}.js`, import.meta.url))

/**
 * A consumer entry over the package's, as ESLint merges them: a severity alone
 * keeps the package's options (`'warn'` over `['error', { args: 'none' }]` is
 * `['warn', { args: 'none' }]`); an entry with options replaces them. Oxlint
 * itself would replace the whole entry.
 */
const mergeEntry = (base: RuleEntry | undefined, entry: RuleEntry): RuleEntry => {
  const severity = Array.isArray(entry) ? entry[0] : entry

  return (Array.isArray(entry) && entry.length > 1) ||
    severity === 'off' ||
    !Array.isArray(base) ||
    base.length < 2
    ? entry
    : [severity, ...base.slice(1)]
}

/** Consumer entries merged over the package's entries that `base` looks up. */
const mergeTable = (consumer: RuleTable, base: (id: string) => RuleEntry | undefined): RuleTable =>
  Object.fromEntries(
    Object.entries(consumer).map(([id, entry]) => [id, mergeEntry(base(id), entry)]),
  )

const offTable = (ids: readonly string[]): RuleTable =>
  Object.fromEntries(ids.map((id) => [id, 'off' as const]))

type OxlintOverride = NonNullable<OxlintConfig['overrides']>[number]

const asOverride = (override: {
  files: string[]
  rules: RuleTable
  env?: Record<string, boolean>
  excludeFiles?: string[]
  globals?: Record<string, 'off' | 'readonly' | 'writable'>
  plugins?: NativePlugin[]
}): OxlintOverride => {
  const { plugins, ...rest } = override
  const result: OxlintOverride = { ...rest }

  if (plugins !== undefined) {
    result.plugins = plugins
  }

  return result
}

/** Oxlint's name for the native plugin that owns a rule id (`react_perf/x` → `react-perf`). */
const nativePluginOf = (engineId: string): string =>
  engineId.slice(0, engineId.indexOf('/')).replaceAll('_', '-')

/**
 * Under the language server a config that fails to load is skipped and its
 * files get some other config's rules without a word, so the error becomes a
 * diagnostic on every file instead; the command line keeps failing the run.
 */
const configurationErrorConfiguration = (message: string): OxlintConfig => ({
  categories: Object.fromEntries(
    ['correctness', 'nursery', 'pedantic', 'perf', 'restriction', 'style', 'suspicious'].map(
      (category) => [category, 'off'],
    ),
  ),
  jsPlugins: [{ name: 'esclint', specifier: pluginSpecifier('configuration-error') }],
  rules: { 'esclint/configuration-error': ['error', message] },
})

export const createOxlintConfiguration = (
  options: Options = {},
  context?: OxlintContext,
): OxlintConfig => {
  try {
    // the config's own folder unless a caller says otherwise (tests)
    return buildOxlintConfiguration(options, context ?? { cwd: configurationDirectory('oxlint') })
  } catch (error) {
    if (error instanceof ConfigurationError && process.argv.includes('--lsp')) {
      return configurationErrorConfiguration(error.message)
    }

    throw error
  }
}

const buildOxlintConfiguration = (options: Options, context: OxlintContext): OxlintConfig => {
  assertProjectRoot(context.cwd)
  const generated = oxlintConfiguration
  const typeAware = options.typeAware ?? true
  const typeAwareRules = new Set(generated.typeAwareRules)
  const jsPluginNames = new Set(generated.jsPlugins.map((plugin) => plugin.name))
  const rootPlugins = new Set(generated.plugins)

  /** Native plugins a table needs beyond `available`; JS plugin shims are always loaded. */
  const missingPlugins = (table: RuleTable, available: ReadonlySet<string>): string[] => [
    ...new Set(
      Object.keys(table)
        .filter((id) => !jsPluginNames.has(id.slice(0, id.indexOf('/'))))
        .map((id) => nativePluginOf(id))
        .filter((plugin) => !available.has(plugin)),
    ),
  ]

  const requirePlugins = (
    table: RuleTable,
    available: ReadonlySet<string>,
    where: string,
  ): void => {
    const [plugin] = missingPlugins(table, available)

    if (plugin === undefined) {
      return
    }

    const rule = Object.keys(table).find((id) => nativePluginOf(id) === plugin) ?? plugin
    const framework = languages.find((language) =>
      (language.oxlint.plugins ?? []).some((native) => native === plugin),
    )?.detect
    const advice =
      plugin === 'vitest'
        ? 'it runs only in test files; set it under `vitest.rules` or in an override'
        : framework === undefined
          ? `this configuration does not enable Oxlint's ${plugin} plugin there; set it in an override, which enables the plugin for those files`
          : `it runs only on ${frameworkName(framework)} files; set it under \`${framework.id}.rules\` (${frameworkName(framework)} support turns on when the project depends on ${framework.packages.join(' or ')}, or with \`${framework.id}: { enabled: true }\`)`

    throw new ConfigurationError(`Rule "${rule}" in ${where} would never run: ${advice}`)
  }

  const consumerRoot: RuleTable = {
    ...toEngineTable(routeConsumerRules(options.rules, 'oxlint')),
    ...toEngineTable(routeConsumerRules(options.typescript?.rules, 'oxlint')),
  }
  requirePlugins(consumerRoot, rootPlugins, '`rules`')

  /** Consumer root rules also win inside generated groups, except where type information is unavailable. */
  const withConsumerRoot = (table: RuleTable): RuleTable => {
    const result = { ...table }

    for (const [id, entry] of Object.entries(consumerRoot)) {
      if (id in result && !typeAwareRules.has(id)) {
        result[id] = mergeEntry(table[id], entry)
      }
    }

    return result
  }

  /** A group's own entry, else the root one: what applies to the group's files before the consumer's. */
  const inGroup =
    (table: RuleTable) =>
    (id: string): RuleEntry | undefined =>
      table[id] ?? generated.rules[id]

  const overrides: NonNullable<OxlintConfig['overrides']> = []

  for (const override of generated.overrides) {
    const { name, ...rest } = override

    if (name === 'javascript') {
      const consumer = toEngineTable(routeConsumerRules(options.javascript?.rules, 'oxlint'))
      requirePlugins(consumer, rootPlugins, '`javascript.rules`')
      overrides.push(
        asOverride({
          ...rest,
          files: options.javascript?.files ?? rest.files,
          rules: { ...withConsumerRoot(rest.rules), ...mergeTable(consumer, inGroup(rest.rules)) },
        }),
      )
    } else if (name === 'tests') {
      const consumer = toEngineTable(routeConsumerRules(options.vitest?.rules, 'oxlint'))
      requirePlugins(consumer, new Set(rest.plugins ?? rootPlugins), '`vitest.rules`')
      overrides.push(
        asOverride({
          ...rest,
          files: options.vitest?.files ?? rest.files,
          rules: { ...withConsumerRoot(rest.rules), ...mergeTable(consumer, inGroup(rest.rules)) },
        }),
      )
    } else {
      overrides.push(asOverride({ ...rest, rules: withConsumerRoot(rest.rules) }))
    }
  }

  // the languages both engines read (Vue): their own override first, then their groups
  for (const { id, overrides: languageOverrides } of generated.languages) {
    const language = languages.find((candidate) => candidate.id === id)

    if (language === undefined) {
      throw new Error(`The generated configuration names unknown language ${id}`)
    }

    const own = frameworkOptions(options, language)
    const consumer = toEngineTable(routeConsumerRules(own?.rules, 'oxlint'))
    const where = `\`${language.detect?.id ?? id}.rules\``

    if (!detectLanguage(context.cwd, language, own?.enabled)) {
      if (language.detect !== undefined && Object.keys(consumer).length > 0) {
        throw frameworkOffError(language.detect, where)
      }

      continue
    }

    for (const override of languageOverrides) {
      const { name, ...rest } = override

      if (name === id) {
        requirePlugins(consumer, new Set(rest.plugins ?? rootPlugins), where)
        overrides.push(
          asOverride({
            ...rest,
            files: own?.files ?? rest.files,
            rules: {
              ...withConsumerRoot(rest.rules),
              // syntax-only until oxlint-tsgolint is verified on the language's files
              ...(language.typeAware ? {} : offTable(generated.typeAwareRules)),
              ...mergeTable(consumer, inGroup(rest.rules)),
            },
          }),
        )
      } else {
        overrides.push(asOverride({ ...rest, rules: withConsumerRoot(rest.rules) }))
      }
    }
  }

  if (options.typeAwareExclude !== undefined && options.typeAwareExclude.length > 0) {
    overrides.push(
      asOverride({ files: options.typeAwareExclude, rules: offTable(generated.typeAwareRules) }),
    )
  }

  for (const override of routeConsumerOverrides(options.overrides, 'oxlint')) {
    const needed = missingPlugins(override.rules, rootPlugins)
    overrides.push(
      asOverride({
        ...override,
        rules: mergeTable(override.rules, (id) => generated.rules[id]),
        ...(needed.length === 0
          ? {}
          : { plugins: [...rootPlugins, ...needed.filter((plugin) => isNativePlugin(plugin))] }),
      }),
    )
  }

  return {
    categories: generated.categories,
    env: { builtin: true, ...options.env },
    ...(options.globals === undefined ? {} : { globals: options.globals }),
    ignorePatterns: collectIgnorePatterns(context.cwd, options.ignorePatterns),
    jsPlugins: generated.jsPlugins.map((plugin) => ({
      name: plugin.name,
      specifier: pluginSpecifier(plugin.shim),
    })),
    // Oxlint accepts `options` only in the root config of a run
    ...(isRootConfiguration('oxlint', context.cwd)
      ? {
          options: {
            // Each engine reads its own disable comments: Oxlint `oxlint-disable`, ESLint
            // `eslint-disable`; `escapace/no-eslint-directives` reports the ones in the wrong lane.
            // So Oxlint never sees the ESLint side's comments in a `.vue` script and can report
            // its own unused ones everywhere.
            reportUnusedDisableDirectives: 'warn',
            respectEslintDisableDirectives: false,
            typeAware,
          },
        }
      : {}),
    overrides,
    plugins: generated.plugins,
    rules: { ...generated.rules, ...mergeTable(consumerRoot, (id) => generated.rules[id]) },
    settings: {
      ...generated.settings,
    },
  }
}
