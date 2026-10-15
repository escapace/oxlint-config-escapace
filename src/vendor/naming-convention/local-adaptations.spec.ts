/*
 * The two places this copy departs from typescript-eslint, both where upstream
 * needs the TypeScript program (see README.md).
 */
import { describe, expect, it } from 'vitest'
import { Linter } from 'eslint'
import parser from '@typescript-eslint/parser'
import rule from './rule.ts'

const lint = (code: string, options: unknown[]): Linter.LintMessage[] =>
  new Linter().verify(
    code,
    [
      {
        files: ['**/*.ts'],
        languageOptions: { parser },
        plugins: { escapace: { rules: { 'naming-convention': rule as never } } },
        rules: { 'escapace/naming-convention': ['error', ...options] as Linter.RuleEntry },
      },
    ],
    'file.ts',
  )

describe('local adaptations', () => {
  it('rejects the `types` option, which needs type information', () => {
    expect(() =>
      lint('const value = 1', [{ format: ['camelCase'], selector: 'variable', types: ['number'] }]),
    ).toThrow(/the `types` option needs type information/)
  })

  it('judges quoting by ECMAScript identifier syntax, as upstream does without a program', () => {
    const messages = lint("const value = { 'needs-quotes': 1, plainName: 2 }", [
      { format: ['camelCase'], selector: 'objectLiteralProperty' },
      { format: null, modifiers: ['requiresQuotes'], selector: 'objectLiteralProperty' },
    ])
    expect(messages).toEqual([])
  })
})
