import type { RuleTableInput } from '../types.ts'

export const rulesJsonIncluded: RuleTableInput = {
  'json/no-floating-decimal': 'error',
  'json/sort-keys': [
    'error',
    {
      allowLineSeparatedGroups: true,
      minKeys: 2,
      order: { caseSensitive: true, natural: false, type: 'asc' },
      pathPattern: '.*',
    },
  ],
  'json/space-unary-ops': 'error',
}
