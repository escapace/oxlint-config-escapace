import type { RuleTableInput } from '../types.ts'

export const rulesDepend: RuleTableInput = {
  'depend/ban-dependencies': [
    'error',
    {
      allowed: ['es-toolkit', 'execa'],
      presets: ['microutilities', 'preferred'],
    },
  ],
}
