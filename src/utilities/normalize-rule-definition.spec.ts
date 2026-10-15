import { builtinRules } from 'eslint/use-at-your-own-risk'
import { describe, expect, it } from 'vitest'

import {
  normalizeRuleDefinition,
  type LooseRuleDefinition,
  type RuleDefinition,
} from './normalize-rule-definition.ts'

const getRule = (name: string): LooseRuleDefinition => builtinRules.get(name)

describe('normalizeRuleDefinition', () => {
  describe('metadata extraction', () => {
    it('extracts description and url', { timeout: 60_000 }, async () => {
      const result = await normalizeRuleDefinition(
        'constructor-super',
        getRule('constructor-super'),
      )

      expect(result.meta.description).toBe('Require `super()` calls in constructors')
      expect(result.meta.url).toBe('https://eslint.org/docs/latest/rules/constructor-super')
    })

    it('extracts type and fixable', { timeout: 60_000 }, async () => {
      const result = await normalizeRuleDefinition('eqeqeq', getRule('eqeqeq'))

      expect(result.meta.type).toBe('suggestion')
      expect(result.meta.fixable).toBe('code')
    })

    it('detects deprecated as object', { timeout: 60_000 }, async () => {
      // max-len has deprecated as an object (not boolean)
      const result = await normalizeRuleDefinition('max-len', getRule('max-len'))

      expect(result.meta.deprecated).toBe(true)
    })

    it('detects non-deprecated rule', { timeout: 60_000 }, async () => {
      const result = await normalizeRuleDefinition('eqeqeq', getRule('eqeqeq'))

      expect(result.meta.deprecated).toBe(false)
    })
  })

  describe('jsdoc generation', () => {
    it('generates description and url comment', { timeout: 60_000 }, async () => {
      const result = await normalizeRuleDefinition(
        'constructor-super',
        getRule('constructor-super'),
      )

      expect(result.meta.descriptionTypescript).toEqual([
        '/**',
        expect.stringContaining('super'),
        ' *',
        ' * https://eslint.org/docs/latest/rules/constructor-super',
        ' */',
      ])
    })

    it('generates empty comment for undefined rule', { timeout: 60_000 }, async () => {
      const result = await normalizeRuleDefinition('test-rule', undefined)

      expect(result.meta.descriptionTypescript).toEqual([])
    })
  })

  describe('schema handling', () => {
    it('handles rule with no schema (0 options)', { timeout: 60_000 }, async () => {
      const result = await normalizeRuleDefinition(
        'constructor-super',
        getRule('constructor-super'),
      )

      expect(result.meta.schema).toEqual([])
      expect(result.meta.typescript).toEqual([])
    })

    it('handles schema as object (not array)', { timeout: 60_000 }, async () => {
      // eqeqeq has a non-array schema
      const result = await normalizeRuleDefinition('eqeqeq', getRule('eqeqeq'))

      expect(result.meta.schema).toHaveLength(1)
      expect(result.meta.typescript).toHaveLength(1)
      expect(result.meta.typescript[0].name).toBe('RuleEqeqeqOptions')
    })

    it('handles rule with 1 schema item', { timeout: 60_000 }, async () => {
      const result = await normalizeRuleDefinition('no-shadow', getRule('no-shadow'))

      expect(result.meta.schema).toHaveLength(1)
      expect(result.meta.typescript).toHaveLength(1)
      expect(result.meta.typescript[0].name).toBe('RuleNoShadowOptions')
    })

    it('handles rule with 3 schema items (ordinal naming)', { timeout: 60_000 }, async () => {
      const result = await normalizeRuleDefinition('max-len', getRule('max-len'))

      expect(result.meta.schema).toHaveLength(3)
      expect(result.meta.typescript).toHaveLength(3)
      expect(result.meta.typescript.map((t) => t.name)).toEqual([
        'RuleMaxLenPrimaryOptions',
        'RuleMaxLenSecondaryOptions',
        'RuleMaxLenTertiaryOptions',
      ])
    })

    it('generates valid typescript for each schema item', { timeout: 60_000 }, async () => {
      const result = await normalizeRuleDefinition('no-shadow', getRule('no-shadow'))

      expect(result.meta.typescript[0].value).toContain('export interface RuleNoShadowOptions')
    })

    it('injects jsdoc above the exported type', { timeout: 60_000 }, async () => {
      const result = await normalizeRuleDefinition('no-shadow', getRule('no-shadow'))
      const lines = result.meta.typescript[0].value.split('\n')
      const exportIndex = lines.findIndex((l) => l.includes('export interface RuleNoShadowOptions'))

      expect(exportIndex).toBeGreaterThan(0)
      expect(lines[exportIndex - 1]).toBe(' */')
    })
  })

  describe('undefined and edge cases', () => {
    it('handles undefined rule definition', { timeout: 60_000 }, async () => {
      const result = await normalizeRuleDefinition('nonexistent', undefined)

      expect(result.meta.schema).toEqual([])
      expect(result.meta.typescript).toEqual([])
      expect(result.meta.deprecated).toBe(false)
      expect(result.meta.description).toBeUndefined()
      expect(result.meta.url).toBeUndefined()
      expect(result.meta.type).toBeUndefined()
      expect(result.meta.fixable).toBeUndefined()
    })

    it('rejects a bare function', { timeout: 60_000 }, async () => {
      await expect(
        normalizeRuleDefinition('bad-rule', (() => ({})) as LooseRuleDefinition),
      ).rejects.toThrow('LooseRuleCreateFunction not supported')
    })
  })

  describe('return shape', () => {
    it('returns a RuleDefinition with all expected meta keys', { timeout: 60_000 }, async () => {
      const result = await normalizeRuleDefinition('eqeqeq', getRule('eqeqeq'))

      expect(result).toEqual({
        meta: {
          deprecated: expect.any(Boolean),
          description: expect.any(String),
          descriptionTypescript: expect.any(Array),
          fixable: expect.any(String),
          schema: expect.any(Array),
          type: expect.any(String),
          typescript: expect.any(Array),
          url: expect.any(String),
        },
      } satisfies { meta: Record<keyof RuleDefinition['meta'], unknown> })
    })
  })
})
