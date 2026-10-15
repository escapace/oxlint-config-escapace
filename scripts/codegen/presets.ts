/*
 * Composes the default rule tables from upstream presets, exactly as the
 * baseline did, then layers the curated tables on top. Output is engine-free.
 */
import type { ESLint, Linter } from 'eslint'
import { mapValues, pickBy } from 'es-toolkit/compat'
import { unavailableReason } from '../../src/capabilities/plugins.ts'
import { rulesAccessibility } from '../../src/configuration/rules/accessibility.ts'
import { rulesJsonIncluded } from '../../src/configuration/rules/json.ts'
import { rulesDepend } from '../../src/configuration/rules/package-json.ts'
import { rulesTomlIncluded } from '../../src/configuration/rules/toml.ts'
import {
  rulesJavascriptIncluded,
  rulesTypescriptIncluded,
} from '../../src/configuration/rules/typescript.ts'
import { rulesVitestIncluded } from '../../src/configuration/rules/vitest.ts'
import { rulesVueIncluded } from '../../src/configuration/rules/vue.ts'
import { rulesYamlIncluded } from '../../src/configuration/rules/yaml.ts'
import type { LanguageId, RuleTable } from '../../src/configuration/types.ts'
import { ensurePreset } from '../../src/utilities/ensure-preset.ts'
import { normalizeRules } from '../../src/utilities/normalize-rules.ts'
import { presetRules } from './plugin-modules.ts'

const configsOf = (plugin: ESLint.Plugin | undefined, key: string): Linter.Config[] =>
  ensurePreset(plugin?.configs, key)

export interface ComposedTables {
  tables: Partial<Record<LanguageId, RuleTable>>
  vitest: RuleTable
}

export interface PresetSources {
  eslintRecommended: Linter.Config
  /** Whether a canonical rule id exists and is current, natively or in a loaded plugin. */
  plugins: Map<string, ESLint.Plugin>
  prettier: Linter.Config
  typescriptEslint: ESLint.Plugin
  isKnown: (id: string) => boolean
}

/** Severities over `table`: a severity alone keeps the options `table` gives the rule, as ESLint merges. */
const withSeverities = (table: RuleTable, severities: RuleTable): RuleTable => ({
  ...table,
  ...Object.fromEntries(
    Object.entries(severities).map(([id, entry]) => {
      const base = table[id]

      return [
        id,
        Array.isArray(base) && typeof entry === 'string' && entry !== 'off'
          ? [entry, ...base.slice(1)]
          : entry,
      ]
    }),
  ),
})

export const composeTables = (sources: PresetSources): ComposedTables => {
  const { plugins } = sources
  const prettierRules = sources.prettier.rules ?? {}

  /** The shared accessibility policy under a plugin's prefix, for the rules that plugin has. */
  const accessibility = (prefix: string): RuleTable =>
    Object.fromEntries(
      Object.entries(rulesAccessibility).flatMap(([name, severity]) =>
        Object.entries(normalizeRules({ [`${prefix}/${name}`]: severity })).filter(
          ([id]) => sources.isKnown(id) && unavailableReason(id) === undefined,
        ),
      ),
    )

  // the same presets for both script languages; each takes only the entries scoped to its files
  const scriptDefaults = (filename: string): RuleTable =>
    normalizeRules(
      ...presetRules(sources.eslintRecommended, filename),
      ...presetRules(
        configsOf(sources.typescriptEslint, 'flat/recommended-type-checked'),
        filename,
      ),
      ...presetRules(configsOf(sources.typescriptEslint, 'flat/stylistic-type-checked'), filename),
      ...presetRules(configsOf(plugins.get('stylistic'), 'disable-legacy'), filename),
      ...presetRules(configsOf(plugins.get('perfectionist'), 'recommended-alphabetical'), filename),
      ...presetRules(configsOf(plugins.get('math'), 'recommended'), filename),
      ...presetRules(configsOf(plugins.get('regexp'), 'flat/recommended'), filename),
      prettierRules,
    )

  // Oxlint's jsx-a11y plugin, which only visits JSX, so plain scripts lose nothing
  const scriptAccessibility = accessibility('jsx-a11y')

  const typescript = normalizeRules(
    scriptDefaults('file.ts'),
    scriptAccessibility,
    rulesTypescriptIncluded,
  )

  const javascript = normalizeRules(
    scriptDefaults('file.js'),
    scriptAccessibility,
    rulesTypescriptIncluded,
    ...presetRules(configsOf(sources.typescriptEslint, 'flat/disable-type-checked'), 'file.js'),
    rulesJavascriptIncluded,
  )

  const vueDefaults = pickBy(
    normalizeRules(
      ...presetRules(configsOf(plugins.get('vue'), 'flat/base')),
      ...presetRules(configsOf(plugins.get('vue'), 'flat/essential')),
      ...presetRules(configsOf(plugins.get('vue'), 'flat/recommended')),
      ...presetRules(configsOf(plugins.get('vue'), 'flat/strongly-recommended')),
      ...presetRules(configsOf(plugins.get('vue-a11y'), 'flat/recommended')),
      pickBy(
        prettierRules,
        (_, key) => key.startsWith('vue/') || key.startsWith('vuejs-accessibility/'),
      ),
    ),
  )

  const vue = normalizeRules(
    withSeverities(vueDefaults, accessibility('vue-a11y')),
    rulesVueIncluded,
  )

  // the presets name rules whose dependencies the bundle leaves out
  const astro = withSeverities(
    pickBy(
      normalizeRules(
        ...presetRules(configsOf(plugins.get('astro'), 'flat/recommended'), 'file.astro'),
        ...presetRules(configsOf(plugins.get('astro'), 'flat/jsx-a11y-recommended'), 'file.astro'),
      ),
      (_, id) => unavailableReason(id) === undefined,
    ),
    accessibility('astro/jsx-a11y'),
  )

  const yaml = normalizeRules(
    ...presetRules(configsOf(plugins.get('yaml'), 'flat/base')),
    ...presetRules(configsOf(plugins.get('yaml'), 'flat/recommended')),
    ...presetRules(configsOf(plugins.get('yaml'), 'flat/prettier')),
    rulesYamlIncluded,
  )

  const jsonVariant = (key: string): RuleTable =>
    normalizeRules(
      ...presetRules(configsOf(plugins.get('json'), key)),
      ...presetRules(configsOf(plugins.get('json'), 'flat/prettier')),
    )
  const jsonDefaults = jsonVariant('flat/recommended-with-json')
  const jsoncDefaults = jsonVariant('flat/recommended-with-jsonc')
  const json5Defaults = jsonVariant('flat/recommended-with-json5')
  const everyJsonRuleOff = mapValues(
    { ...jsonDefaults, ...jsoncDefaults, ...json5Defaults },
    () => 'off' as const,
  )

  const json = { ...everyJsonRuleOff, ...jsonDefaults, ...normalizeRules(rulesJsonIncluded) }
  const jsonc = { ...everyJsonRuleOff, ...jsoncDefaults, ...normalizeRules(rulesJsonIncluded) }
  const json5 = { ...everyJsonRuleOff, ...json5Defaults, ...normalizeRules(rulesJsonIncluded) }

  const toml = normalizeRules(
    ...presetRules(configsOf(plugins.get('toml'), 'flat/base')),
    ...presetRules(configsOf(plugins.get('toml'), 'flat/recommended')),
    ...presetRules(configsOf(plugins.get('toml'), 'flat/standard')),
    rulesTomlIncluded,
  )

  const vitest = normalizeRules(rulesVitestIncluded)
  const packageJson = normalizeRules(rulesDepend, { 'json/sort-keys': 'off' })

  return {
    tables: {
      astro,
      javascript,
      json,
      json5,
      jsonc,
      'package-json': packageJson,
      toml,
      typescript,
      vue,
      yaml,
    },
    vitest,
  }
}
