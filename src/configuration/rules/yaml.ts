import type { RuleTableInput } from '../types.ts'

/** Options type of `yaml/sort-keys` (eslint-plugin-yml), kept here so the key orders can be typed. */
export type RuleYamlSortKeysOptions =
  | [
      'asc' | 'desc',
      {
        allowLineSeparatedGroups?: boolean
        caseSensitive?: boolean
        minKeys?: number
        natural?: boolean
      },
    ]
  | ['asc' | 'desc']
  | []
  | [
      {
        order:
          | Array<
              | string
              | {
                  keyPattern?: string
                  order?:
                    | { caseSensitive?: boolean; natural?: boolean; type?: 'asc' | 'desc' }
                    | { type: 'ignore' }
                }
            >
          | { caseSensitive?: boolean; natural?: boolean; type?: 'asc' | 'desc' }
          | { type: 'ignore' }
        pathPattern: string
        allowLineSeparatedGroups?: boolean
        hasProperties?: string[]
        minKeys?: number
      },
      ...Array<{
        order:
          | Array<
              | string
              | {
                  keyPattern?: string
                  order?:
                    | { caseSensitive?: boolean; natural?: boolean; type?: 'asc' | 'desc' }
                    | { type: 'ignore' }
                }
            >
          | { caseSensitive?: boolean; natural?: boolean; type?: 'asc' | 'desc' }
          | { type: 'ignore' }
        pathPattern: string
        allowLineSeparatedGroups?: boolean
        hasProperties?: string[]
        minKeys?: number
      }>,
    ]

/** The generic fallback ordering, appended after every semantic key order. */
export const yamlSortKeysOptions: RuleYamlSortKeysOptions = [
  {
    allowLineSeparatedGroups: true,
    minKeys: 2,
    order: { caseSensitive: true, natural: false, type: 'asc' },
    pathPattern: '.*',
  },
]

export const rulesYamlIncluded: RuleTableInput = {
  'yaml/block-mapping-colon-indicator-newline': 'error',
  'yaml/block-mapping-question-indicator-newline': 'error',
  // oxfmt writes nested sequences as `- - item` and undoes this rule's fix
  'yaml/block-sequence-hyphen-indicator-newline': 'off',
  'yaml/file-extension': 'error',
  'yaml/flow-mapping-curly-newline': 'error',
  'yaml/flow-sequence-bracket-newline': 'error',
  'yaml/no-empty-mapping-value': 'off',
  'yaml/no-multiple-empty-lines': 'error',
  'yaml/no-trailing-zeros': 'error',
  'yaml/sort-keys': ['error', ...yamlSortKeysOptions],
  'yaml/spaced-comment': 'error',
}
