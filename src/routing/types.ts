import type { LanguageDefinition } from '../configuration/languages.ts'
import type { OverrideGroup } from '../configuration/overrides.ts'
import type { Engine, LanguageId, RuleEntry, RuleTable } from '../configuration/types.ts'
import type { Exclusion } from '../capabilities/exclusions.ts'
import type { NativePlugin } from '../capabilities/native-plugins.ts'
import type { PluginCapability } from '../capabilities/plugins.ts'

export interface Capabilities {
  aliases: Readonly<Record<string, string>>
  exclusions: readonly Exclusion[]
  features: { languagePlugins: boolean }
  nativeRules: ReadonlyMap<string, NativeRule>
  oxlintVersion: string
  parserLevelRules: readonly string[]
  plugins: readonly PluginCapability[]
}

export type DropReason = 'no-engine' | 'parser-level' | 'plugin-rule-not-exposed'

export interface NativeRule {
  category: string
  /** `scope/value` as Oxlint names it, with `eslint/` for core rules. */
  id: string
  typeAware: boolean
}

/** The overrides of a language both engines read, merged only when the language is on. */
export interface OxlintLanguageOutput {
  id: LanguageId
  /** The language's own override first, then its override groups. */
  overrides: OxlintOverrideOutput[]
}

export interface OxlintOutput {
  jsPlugins: Array<{ name: string; shim: string }>
  languages: OxlintLanguageOutput[]
  overrides: OxlintOverrideOutput[]
  plugins: NativePlugin[]
  rules: RuleTable
  /** Rule ids (Oxlint names) that need type information; turned off for JavaScript and `typeAwareExclude`. */
  typeAwareRules: string[]
}
export interface OxlintOverrideOutput {
  files: string[]
  name: string
  rules: RuleTable
  env?: Record<string, boolean>
  plugins?: NativePlugin[]
}

export interface ResidualLanguageOutput {
  files: string[]
  id: LanguageId
  plugins: string[]
  provider: NonNullable<LanguageDefinition['eslint']>['provider']
  rules: RuleTable
}

export interface ResidualOutput {
  languages: ResidualLanguageOutput[]
  overrides: ResidualOverrideOutput[]
  /** Plugins any residual entry references. */
  plugins: string[]
}

export interface ResidualOverrideOutput {
  files: string[]
  language: LanguageId
  name: string
  rules: RuleTable
}

/** An override group whose rules are normalized like the language tables. */
export interface ResolvedOverrideGroup extends Omit<OverrideGroup, 'rules'> {
  rules: RuleTable
}

export interface ResolvedConfiguration {
  ignorePatterns: readonly string[]
  languages: readonly LanguageDefinition[]
  overrides: readonly ResolvedOverrideGroup[]
  settings: Record<string, unknown>
  /** Fully resolved rule tables per language (presets, curated entries and disables already merged). */
  tables: Partial<Record<LanguageId, RuleTable>>
}

export interface RouteEntry {
  engine: 'dropped' | Engine
  entry: RuleEntry
  /** Canonical id. */
  id: string
  language: LanguageId
  /** Id as the engine knows it (`eslint/no-unused-vars`, `escapace/name-replacements`, `yaml/sort-keys`). */
  engineId: string
  /** For overrides: the group name; absent for language tables. */
  reason: DropReason | RouteVia
  group?: string
}

export interface RouteResult {
  eslint: ResidualOutput
  oxlint: OxlintOutput
  report: RouteEntry[]
}

export type RouteVia = 'js-plugin' | 'native-type-aware' | 'native' | 'residual'
