import type { RuleTableInput } from '../types.ts'

export const rulesVitestIncluded: RuleTableInput = {
  'vitest/consistent-test-it': ['error', { fn: 'it' }],
  'vitest/consistent-vitest-vi': ['error', { fn: 'vi' }],
  'vitest/expect-expect': 'off',
  'vitest/max-nested-describe': ['error', { max: 2 }],
  'vitest/no-alias-methods': 'error',
  'vitest/no-test-return-statement': 'error',
  'vitest/prefer-hooks-in-order': 'error',
  'vitest/prefer-hooks-on-top': 'error',
  'vitest/prefer-mock-promise-shorthand': 'error',
  'vitest/require-awaited-expect-poll': 'error',
  'vitest/require-to-throw-message': 'warn',
}
