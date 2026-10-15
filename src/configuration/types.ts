/*
 * Engine-free vocabulary shared by the configuration tables, the router and the
 * public API. Nothing here names an engine.
 */

import type { Rules } from '../generated/rules.ts'

export type Engine = 'eslint' | 'oxlint'
/** Languages a project turns on by depending on their framework; each has an option of its own. */
export type FrameworkLanguageId = 'astro' | 'vue'

export type LanguageId =
  | 'astro'
  | 'javascript'
  | 'json'
  | 'json5'
  | 'jsonc'
  | 'package-json'
  | 'toml'
  | 'typescript'
  | 'vue'
  | 'yaml'

/**
 * A native Oxlint rule entry from `OxlintConfig['rules']` with this package's
 * severity spellings in place of Oxlint's; the option types stay Oxlint's.
 */
export type NativeRuleEntryInput<Entry> = Entry extends readonly [unknown, ...infer Options]
  ? [RuleSeverityInput, ...Options]
  : Entry extends number | string
    ? RuleSeverityInput
    : never
export interface OverrideInput {
  files: string[]
  /** Oxlint `env` entries for these files; the residual ignores it. */
  env?: Record<string, boolean>
  excludeFiles?: string[]
  /** Oxlint `globals` for these files; the residual ignores it. */
  globals?: Record<string, 'off' | 'readonly' | 'writable'>
  rules?: RuleTableInput
}

export type RuleEntry = RuleSeverity | [RuleSeverity, ...unknown[]]

/** A severity alone or a severity followed by the rule's positional options. */
export type RuleEntryInput<Options extends readonly unknown[] = unknown[]> =
  | RuleSeverityInput
  | [RuleSeverityInput, ...Options]

/**
 * Positional options of a rule whose schema describes the whole options array:
 * the generated tuple as is, or one optional slot when it is not a tuple.
 */
export type RuleOptionsInput<Options> = Options extends readonly unknown[]
  ? [...Options]
  : [Options?]
export type RuleSeverity = 'error' | 'off' | 'warn'

export type RuleSeverityInput = 'allow' | 'deny' | 0 | 1 | 2 | RuleSeverity

/** Canonical rule id → entry. Keys are canonical ids such as `eslint/no-eval` or `yaml/sort-keys`. */
export type RuleTable = Record<string, RuleEntry>

/** Canonical rule id → entry, typed per rule from the generated option types; unknown ids are accepted. */
export type RuleTableInput = Rules
