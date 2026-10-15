import type { Linter } from 'eslint'
import { describe, expect, it } from 'vitest'

import { ensurePreset } from './ensure-preset.ts'
import { extractRules } from './extract-rules.ts'
import { normalizeRules } from './normalize-rules.ts'

describe('normalizeRules', () => {
  describe('severity normalization', () => {
    it('converts numeric 0 to "off"', { timeout: 60_000 }, () => {
      expect(normalizeRules({ 'no-eval': 0 })).toEqual({ 'eslint/no-eval': 'off' })
    })

    it('converts numeric 1 to "warn"', { timeout: 60_000 }, () => {
      expect(normalizeRules({ 'no-eval': 1 })).toEqual({ 'eslint/no-eval': 'warn' })
    })

    it('converts numeric 2 to "error"', { timeout: 60_000 }, () => {
      expect(normalizeRules({ 'no-eval': 2 })).toEqual({ 'eslint/no-eval': 'error' })
    })

    it('passes through string "off"', { timeout: 60_000 }, () => {
      expect(normalizeRules({ 'no-eval': 'off' })).toEqual({ 'eslint/no-eval': 'off' })
    })

    it('passes through string "warn"', { timeout: 60_000 }, () => {
      expect(normalizeRules({ 'no-eval': 'warn' })).toEqual({ 'eslint/no-eval': 'warn' })
    })

    it('passes through string "error"', { timeout: 60_000 }, () => {
      expect(normalizeRules({ 'no-eval': 'error' })).toEqual({ 'eslint/no-eval': 'error' })
    })

    it('normalizes numeric severity in array form', { timeout: 60_000 }, () => {
      expect(normalizeRules({ 'no-eval': [2] })).toEqual({ 'eslint/no-eval': ['error'] })
    })

    it('preserves options after severity in array form', { timeout: 60_000 }, () => {
      expect(normalizeRules({ eqeqeq: [2, 'always', { null: 'ignore' }] })).toEqual({
        'eslint/eqeqeq': ['error', 'always', { null: 'ignore' }],
      })
    })

    it('preserves options with string severity', { timeout: 60_000 }, () => {
      expect(normalizeRules({ eqeqeq: ['warn', 'smart'] })).toEqual({
        'eslint/eqeqeq': ['warn', 'smart'],
      })
    })
  })

  describe('perfectionist special case', () => {
    it('downgrades numeric 2 to "warn" for perfectionist rules', { timeout: 60_000 }, () => {
      expect(normalizeRules({ 'perfectionist/sort-imports': 2 })).toEqual({
        'perfectionist/sort-imports': 'warn',
      })
    })

    it('downgrades string "error" to "warn" for perfectionist rules', { timeout: 60_000 }, () => {
      expect(normalizeRules({ 'perfectionist/sort-objects': 'error' })).toEqual({
        'perfectionist/sort-objects': 'warn',
      })
    })

    it('downgrades severity in array form for perfectionist rules', { timeout: 60_000 }, () => {
      expect(
        normalizeRules({ 'perfectionist/sort-objects': [2, { type: 'alphabetical' }] }),
      ).toEqual({
        'perfectionist/sort-objects': ['warn', { type: 'alphabetical' }],
      })
    })

    it('does not affect "off" for perfectionist rules', { timeout: 60_000 }, () => {
      expect(normalizeRules({ 'perfectionist/sort-imports': 'off' })).toEqual({
        'perfectionist/sort-imports': 'off',
      })
    })

    it('does not affect non-perfectionist rules at error level', { timeout: 60_000 }, () => {
      expect(normalizeRules({ 'no-eval': 2 })).toEqual({ 'eslint/no-eval': 'error' })
    })
  })

  describe('key aliasing', () => {
    it('renames @typescript-eslint/ to typescript/', { timeout: 60_000 }, () => {
      expect(normalizeRules({ '@typescript-eslint/no-unused-vars': 'error' })).toEqual({
        'typescript/no-unused-vars': 'error',
      })
    })

    it('renames vuejs-accessibility/ to vue-a11y/', { timeout: 60_000 }, () => {
      expect(normalizeRules({ 'vuejs-accessibility/alt-text': 'error' })).toEqual({
        'vue-a11y/alt-text': 'error',
      })
    })

    it('renames yml/ to yaml/', { timeout: 60_000 }, () => {
      expect(normalizeRules({ 'yml/sort-keys': 'warn' })).toEqual({
        'yaml/sort-keys': 'warn',
      })
    })

    it('renames jsonc/ to json/', { timeout: 60_000 }, () => {
      expect(normalizeRules({ 'jsonc/no-comments': 'error' })).toEqual({
        'json/no-comments': 'error',
      })
    })

    it('renames @stylistic/ to stylistic/', { timeout: 60_000 }, () => {
      expect(normalizeRules({ '@stylistic/comma-dangle': 'warn' })).toEqual({
        'stylistic/comma-dangle': 'warn',
      })
    })

    it('drops @babel/ prefixed rules', { timeout: 60_000 }, () => {
      expect(normalizeRules({ '@babel/semi': 'error' })).toEqual({})
    })

    it('drops react/ prefixed rules', { timeout: 60_000 }, () => {
      expect(normalizeRules({ 'react/jsx-uses-react': 'error' })).toEqual({})
    })

    it(
      'prefixes bare core rules and passes other namespaces unchanged',
      { timeout: 60_000 },
      () => {
        expect(normalizeRules({ 'no-eval': 'error', 'unicorn/no-null': 'warn' })).toEqual({
          'eslint/no-eval': 'error',
          'unicorn/no-null': 'warn',
        })
      },
    )
  })

  describe('merging and filtering', () => {
    it('returns empty object for no arguments', { timeout: 60_000 }, () => {
      expect(normalizeRules()).toEqual({})
    })

    it('returns empty object when all arguments are undefined', { timeout: 60_000 }, () => {
      expect(normalizeRules(undefined, undefined)).toEqual({})
    })

    it('skips undefined entries within a rules object', { timeout: 60_000 }, () => {
      expect(normalizeRules({ 'no-alert': undefined, 'no-eval': 'error' })).toEqual({
        'eslint/no-eval': 'error',
      })
    })

    it('later objects override earlier ones', { timeout: 60_000 }, () => {
      expect(normalizeRules({ 'no-eval': 'error' }, { 'no-eval': 'off' })).toEqual({
        'eslint/no-eval': 'off',
      })
    })

    it('merges multiple rule objects', { timeout: 60_000 }, () => {
      expect(normalizeRules({ 'no-alert': 'warn' }, { 'no-eval': 'error' })).toEqual({
        'eslint/no-alert': 'warn',
        'eslint/no-eval': 'error',
      })
    })

    it('skips undefined objects in arguments', { timeout: 60_000 }, () => {
      expect(normalizeRules(undefined, { 'no-eval': 'error' }, undefined)).toEqual({
        'eslint/no-eval': 'error',
      })
    })
  })
})

const config = (rules: Linter.RulesRecord): Linter.Config => ({ rules })

describe('extractRules', () => {
  it('extracts rules from flat configs', { timeout: 60_000 }, () => {
    const result = extractRules(config({ 'no-eval': 'error' }))

    expect(result).toEqual([{ 'no-eval': 'error' }])
  })

  it('extracts rules from nested config arrays', { timeout: 60_000 }, () => {
    const result = extractRules([config({ 'no-eval': 'error' }), config({ 'no-alert': 'warn' })])

    expect(result).toEqual([{ 'no-eval': 'error' }, { 'no-alert': 'warn' }])
  })

  it('handles mixed flat and nested configs', { timeout: 60_000 }, () => {
    const result = extractRules(config({ a: 'off' }), [config({ b: 'error' })])

    expect(result).toEqual([{ a: 'off' }, { b: 'error' }])
  })

  it('skips undefined entries', { timeout: 60_000 }, () => {
    const result = extractRules(undefined, config({ a: 'error' }), undefined)

    expect(result).toEqual([{ a: 'error' }])
  })

  it('returns undefined for configs without rules', { timeout: 60_000 }, () => {
    const noRules: Linter.Config = { plugins: {} }
    const result = extractRules(noRules)

    expect(result).toEqual([undefined])
  })

  it('returns empty array for no arguments', { timeout: 60_000 }, () => {
    expect(extractRules()).toEqual([])
  })
})

describe('ensurePreset', () => {
  it('returns a single config wrapped in an array', { timeout: 60_000 }, () => {
    const config = { rules: { a: 'error' } }
    const result = ensurePreset({ myPreset: config }, 'myPreset')

    expect(result).toEqual([config])
  })

  it('returns an array config as-is', { timeout: 60_000 }, () => {
    const configs = [{ rules: { a: 'error' } }, { rules: { b: 'warn' } }]
    const result = ensurePreset({ myPreset: configs }, 'myPreset')

    expect(result).toEqual(configs)
  })

  it('throws for undefined config object', { timeout: 60_000 }, () => {
    expect(() => ensurePreset(undefined, 'x')).toThrow(/.+/)
  })

  it('throws for missing key', { timeout: 60_000 }, () => {
    expect(() => ensurePreset({}, 'missing')).toThrow(/.+/)
  })
})
