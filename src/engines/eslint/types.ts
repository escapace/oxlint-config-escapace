import type { ESLint, Linter } from 'eslint'

/** What a generated residual group module exports for one language. */
export interface ResidualGroup {
  parser: Linter.Parser | undefined
  parserOptions: Record<string, unknown> | undefined
  plugins: Record<string, ESLint.Plugin>
  processor: Linter.Processor | undefined
}
