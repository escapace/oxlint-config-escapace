import type { FrameworkLanguageId, OverrideInput, RuleTableInput } from './types.ts'

export interface LanguageOptions {
  /** Replace the default file globs of this language group. */
  files?: string[]
  rules?: RuleTableInput
}

/** `enabled` overrides the detection of the framework's package in the project. */
export interface FrameworkLanguageOptions extends LanguageOptions {
  enabled?: boolean
}

/** Options accepted by `escapace()` from the package root (the Oxlint half). */
export interface Options {
  /** Astro components; on when the project depends on astro. */
  astro?: FrameworkLanguageOptions
  /** Oxlint `env` entries, passed through. */
  env?: Record<string, boolean>
  globals?: Record<string, 'off' | 'readonly' | 'writable'>
  /** Added to the generated ignore list and the ignore files; never replaces them. */
  ignorePatterns?: string[]
  javascript?: LanguageOptions
  /** Each item is routed by the rules it contains; items whose rules belong to the other engine throw. */
  overrides?: OverrideInput[]
  /** Routed per entry; an entry whose rule belongs to the other engine throws. */
  rules?: RuleTableInput
  /** Oxlint's own option, passed through. Default `true`. */
  typeAware?: boolean
  /** Globs whose files keep syntax-only linting; generates an override turning type-aware rules off. */
  typeAwareExclude?: string[]
  /** TypeScript rules apply to every file Oxlint parses; only `rules` is meaningful here. */
  typescript?: Pick<LanguageOptions, 'rules'>
  vitest?: LanguageOptions
  /** Vue components; on when the project depends on vue. */
  vue?: FrameworkLanguageOptions
}

/** Options accepted by `escapace()` from `oxlint-config-escapace/eslint` (the residual half). */
export type ResidualOptions = Pick<
  Options,
  'ignorePatterns' | 'overrides' | 'rules' | FrameworkLanguageId
>
