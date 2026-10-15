import type { Linter } from 'eslint'
import type { ResidualOptions } from './configuration/options.ts'
import { createEslintConfiguration } from './engines/eslint/configuration.ts'

export type { ResidualOptions } from './configuration/options.ts'
export type { OverrideInput, RuleEntryInput, RuleTableInput } from './configuration/types.ts'
export type { Rules } from './generated/rules.ts'

/** The ESLint configuration for the residual languages. Default-export it from `eslint.config.mjs`. */
export const escapace = (options?: ResidualOptions): Linter.Config[] =>
  createEslintConfiguration(options)
