import { ESLintUtils } from '@typescript-eslint/utils'

/** Upstream `createRule`; the documentation stays typescript-eslint's, whose options this copy keeps. */
export const createRule = ESLintUtils.RuleCreator<{ description: string; frozen?: boolean }>(
  (name) => `https://typescript-eslint.io/rules/${name}`,
)
