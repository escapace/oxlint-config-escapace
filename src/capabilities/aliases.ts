/*
 * Canonical rule ids that Oxlint implements under another scope or name.
 * The seven typescript-eslint rules below are type-aware-free re-exports of
 * core rules; Oxlint's core versions understand TypeScript syntax, so the
 * canonical id maps onto them.
 */
export const aliases: Readonly<Record<string, string>> = {
  'typescript/no-array-constructor': 'eslint/no-array-constructor',
  'typescript/no-empty-function': 'eslint/no-empty-function',
  'typescript/no-redeclare': 'eslint/no-redeclare',
  'typescript/no-unused-expressions': 'eslint/no-unused-expressions',
  'typescript/no-unused-vars': 'eslint/no-unused-vars',
  'typescript/no-use-before-define': 'eslint/no-use-before-define',
  'typescript/no-useless-constructor': 'eslint/no-useless-constructor',
}

/**
 * Rules that moved: the naming policy runs as the `escapace` plugin (Oxlint
 * reserves `typescript` and `unicorn`), and unicorn renamed
 * `prevent-abbreviations`. Config keys under the old ids are accepted; disable
 * comments must use the new ids.
 */
export const renamedRules: Readonly<Record<string, string>> = {
  'typescript/naming-convention': 'escapace/naming-convention',
  'unicorn/name-replacements': 'escapace/name-replacements',
  'unicorn/prevent-abbreviations': 'escapace/name-replacements',
}
