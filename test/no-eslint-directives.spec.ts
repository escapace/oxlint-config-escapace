import { Linter } from 'eslint'
import { describe, expect, it } from 'vitest'
import { noEslintDirectives } from '../src/engines/oxlint/escapace/no-eslint-directives.ts'

// inline config off, so ESLint itself does not act on the comments under test
const linter = new Linter({ configType: 'flat' })
const configuration: Linter.Config[] = [
  {
    files: ['**/*.ts', '**/*.vue', '**/*.cjs'],
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'off' },
    plugins: { escapace: { rules: { 'no-eslint-directives': noEslintDirectives } } },
    rules: { 'escapace/no-eslint-directives': 'error' },
  },
  // HTML-like comments exist only in scripts
  { files: ['**/*.cjs'], languageOptions: { sourceType: 'script' } },
]

// the rule's own messages; ESLint adds a note for every inline comment it is told to ignore
const messages = (code: string, filename: string): string[] =>
  linter
    .verify(code, configuration, filename)
    .filter((message) => message.ruleId === 'escapace/no-eslint-directives')
    .map((message) => `${message.line}: ${message.message}`)

const fixed = (code: string, filename: string): string =>
  linter.verifyAndFix(code, configuration, filename).output

describe('escapace/no-eslint-directives', () => {
  it('renames every eslint directive in the files only Oxlint lints, keeping rules and reasons', () => {
    const code = [
      '// eslint-disable-next-line no-debugger -- reason',
      '/*eslint-disable no-console*/',
      '/* eslint-enable no-console */',
      'const a = 1 // eslint-disable-line',
      '/* eslint-disable */',
      '',
    ].join('\n')

    expect(messages(code, 'a.ts')).toHaveLength(5)
    expect(fixed(code, 'a.ts')).toBe(
      [
        '// oxlint-disable-next-line no-debugger -- reason',
        '/*oxlint-disable no-console*/',
        '/* oxlint-enable no-console */',
        'const a = 1 // oxlint-disable-line',
        '/* oxlint-disable */',
        '',
      ].join('\n'),
    )
  })

  it('reads directives as ESLint does: any dash run before the reason, quoted names', () => {
    const code = [
      '// eslint-disable-next-line \'no-console\', "no-debugger" --- reason, with -- dashes',
      '',
    ].join('\n')

    expect(fixed(code, 'a.ts')).toBe(
      '// oxlint-disable-next-line no-console, no-debugger --- reason, with -- dashes\n',
    )
  })

  it('renames rules that moved to the names Oxlint knows them by', () => {
    const code =
      '// eslint-disable-next-line @typescript-eslint/naming-convention, unicorn/prevent-abbreviations, @typescript-eslint/no-explicit-any\n'

    expect(fixed(code, 'a.ts')).toBe(
      '// oxlint-disable-next-line escapace/naming-convention, escapace/name-replacements, @typescript-eslint/no-explicit-any\n',
    )
  })

  it('fixes HTML-like comments in place', () => {
    const code = 'x = 1 <!-- eslint-disable-line no-console\n--> eslint-disable-line no-console\n'

    expect(fixed(code, 'a.cjs')).toBe(
      'x = 1 <!-- oxlint-disable-line no-console\n--> oxlint-disable-line no-console\n',
    )
  })

  it('leaves comments that only look like directives alone', () => {
    const code = [
      '// eslint is fine here',
      '/* eslint-env node */',
      '/* global window */',
      '// eslint-disable-nextline no-debugger',
      '// oxlint-disable-next-line no-debugger',
      '',
    ].join('\n')

    expect(messages(code, 'a.ts')).toEqual([])
  })

  it("in a .vue script, takes only comments whose rules are all Oxlint's", () => {
    const code = [
      '// eslint-disable-next-line @typescript-eslint/no-explicit-any',
      '// eslint-disable-next-line vue/require-v-for-key',
      '// eslint-disable-next-line vue/require-v-for-key, no-console',
      '/* eslint-disable vue/require-v-for-key, no-console */',
      '/* eslint-disable */',
      '// eslint-disable-next-line depend/ban-dependencies',
      'export const a = 1',
      '',
    ].join('\n')

    expect(messages(code, 'Card.vue')).toEqual([
      '1: Oxlint ignores eslint-disable-next-line comments, so this one disables nothing; use oxlint-disable-next-line.',
      '3: In a .vue file ESLint reads only eslint- comments and Oxlint only oxlint- ones; end the line this comment disables with // oxlint-disable-line no-console (an eslint-disable-line comment there becomes a /* */ comment before it).',
      '4: In a .vue file ESLint reads only eslint- comments and Oxlint only oxlint- ones; move no-console into an oxlint-disable comment of its own.',
      '6: Oxlint ignores eslint-disable-next-line comments, so this one disables nothing; use oxlint-disable-next-line.',
    ])
    expect(fixed(code, 'Card.vue').split('\n')[0]).toBe(
      '// oxlint-disable-next-line @typescript-eslint/no-explicit-any',
    )
  })
})
