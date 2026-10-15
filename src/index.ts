export { defineConfig } from 'oxlint'
export type { OxlintConfig } from 'oxlint'
export type {
  FrameworkLanguageOptions,
  LanguageOptions,
  Options,
  ResidualOptions,
} from './configuration/options.ts'
export type {
  OverrideInput,
  RuleEntry,
  RuleEntryInput,
  RuleTableInput,
} from './configuration/types.ts'
export type { Rules } from './generated/rules.ts'

import { createOxlintConfiguration } from './engines/oxlint/configuration.ts'
import type { Options } from './configuration/options.ts'
import type { OxlintConfig } from 'oxlint'

/** The Oxlint configuration. Default-export it from `oxlint.config.ts`; never `extends` it. */
export const escapace = (options?: Options): OxlintConfig => createOxlintConfiguration(options)
