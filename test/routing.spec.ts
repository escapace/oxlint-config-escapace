import { describe, expect, it } from 'vitest'
import type { LanguageDefinition } from '../src/configuration/languages.ts'
import { languages } from '../src/configuration/languages.ts'
import type { RuleEntry } from '../src/configuration/types.ts'
import type { Capabilities, NativeRule } from '../src/routing/types.ts'
import { route, routeRule } from '../src/routing/route.ts'
import { oxlintConfiguration } from '../src/generated/oxlint-configuration.ts'
import { residualConfiguration } from '../src/generated/residual-configuration.ts'
import { ruleIndex } from '../src/generated/rule-index.ts'
import { normalizeRuleKey, normalizeRules } from '../src/utilities/normalize-rules.ts'
import { rulesAccessibility } from '../src/configuration/rules/accessibility.ts'
import { rules as astroRules } from '../src/generated/rules/astro.ts'
import { rules as typescriptRules } from '../src/generated/rules/typescript.ts'
import { rules as vueRules } from '../src/generated/rules/vue.ts'

const native = (id: string, typeAware = false): [string, NativeRule] => [
  id,
  { category: 'correctness', id, typeAware },
]

const capabilities: Capabilities = {
  aliases: { 'typescript/no-unused-vars': 'eslint/no-unused-vars' },
  exclusions: [
    {
      id: 'perfectionist/sort-objects',
      issue: 'https://example.invalid/1',
      reason: 'synthetic',
      until: '99.0.0',
    },
  ],
  features: { languagePlugins: false },
  nativeRules: new Map([
    native('eslint/no-unused-vars'),
    native('perfectionist/sort-objects'),
    native('typescript/no-floating-promises', true),
    native('unicorn/no-null'),
  ]),
  oxlintVersion: '1.87.0',
  parserLevelRules: ['eslint/no-dupe-args'],
  plugins: [],
}

const byId = (id: LanguageDefinition['id']): LanguageDefinition => {
  const language = languages.find((candidate) => candidate.id === id)

  if (language === undefined) {
    throw new Error(id)
  }

  return language
}

const typescript = byId('typescript')
const yaml = byId('yaml')
const vue = byId('vue')

describe('routeRule', () => {
  it('drops parser-level rules before anything else', () => {
    expect(routeRule(typescript, 'eslint/no-dupe-args', 'error', capabilities)).toMatchObject({
      engine: 'dropped',
      reason: 'parser-level',
    })
  })

  it('prefers the native rule and remaps aliases', () => {
    expect(routeRule(typescript, 'typescript/no-unused-vars', 'error', capabilities)).toMatchObject(
      {
        engine: 'oxlint',
        engineId: 'eslint/no-unused-vars',
        reason: 'native',
      },
    )
  })

  it('marks type-aware native rules', () => {
    expect(
      routeRule(typescript, 'typescript/no-floating-promises', 'error', capabilities),
    ).toMatchObject({ engine: 'oxlint', reason: 'native-type-aware' })
  })

  it('falls back to the JS plugin shim when the native rule is excluded', () => {
    expect(routeRule(typescript, 'perfectionist/sort-objects', 'warn', capabilities)).toMatchObject(
      { engine: 'oxlint', engineId: 'perfectionist/sort-objects', reason: 'js-plugin' },
    )
  })

  it('routes the naming policy to the escapace plugin', () => {
    expect(
      routeRule(typescript, 'escapace/name-replacements', 'error', capabilities),
    ).toMatchObject({
      engine: 'oxlint',
      engineId: 'escapace/name-replacements',
      reason: 'js-plugin',
    })
  })

  it('drops rules of a plugin Oxlint cannot load when the language has no residual', () => {
    expect(routeRule(typescript, 'unicorn/no-array-sort', 'warn', capabilities)).toMatchObject({
      engine: 'dropped',
      reason: 'no-engine',
    })
  })

  it('routes unsupported languages to the residual when the plugin may serve it', () => {
    expect(routeRule(yaml, 'yaml/sort-keys', 'error', capabilities)).toMatchObject({
      engine: 'eslint',
      engineId: 'yaml/sort-keys',
      reason: 'residual',
    })
    expect(routeRule(yaml, 'perfectionist/sort-objects', 'warn', capabilities)).toMatchObject({
      engine: 'dropped',
      reason: 'no-engine',
    })
  })

  it('splits Vue by rule: script rules native, template rules residual', () => {
    expect(routeRule(vue, 'eslint/no-unused-vars', 'error', capabilities)).toMatchObject({
      engine: 'oxlint',
      reason: 'native',
    })
    expect(routeRule(vue, 'vue/require-v-for-key', 'error', capabilities)).toMatchObject({
      engine: 'eslint',
      reason: 'residual',
    })
  })
})

describe('route', () => {
  const result = route(
    {
      ignorePatterns: [],
      languages: [typescript, byId('javascript'), vue, yaml],
      overrides: [
        {
          env: { vitest: true },
          files: ['**/*.spec.ts'],
          language: 'typescript',
          name: 'tests',
          nativePlugins: ['vitest'],
          rules: { 'typescript/no-floating-promises': 'off' },
        },
      ],
      settings: {},
      tables: {
        javascript: { 'eslint/no-unused-vars': 'warn' },
        typescript: {
          'escapace/name-replacements': 'error',
          'eslint/no-unused-vars': 'error',
          'perfectionist/sort-objects': 'warn',
          'typescript/no-floating-promises': 'error',
        },
        vue: { 'eslint/no-unused-vars': 'error', 'vue/require-v-for-key': 'error' },
        yaml: { 'yaml/no-empty-key': 'off', 'yaml/sort-keys': 'error' },
      },
    },
    capabilities,
  )

  it('collects type-aware rules and turns them off for JavaScript', () => {
    expect(result.oxlint.typeAwareRules).toEqual(['typescript/no-floating-promises'])
    const javascript = result.oxlint.overrides.find((override) => override.name === 'javascript')
    expect(javascript?.rules).toEqual({
      'eslint/no-unused-vars': 'warn',
      'typescript/no-floating-promises': 'off',
    })
  })

  it('lists the JS plugin shims the tables need', () => {
    expect(result.oxlint.jsPlugins).toEqual([
      { name: 'escapace', shim: 'escapace' },
      { name: 'perfectionist', shim: 'perfectionist' },
    ])
  })

  it('adds native plugins to override groups', () => {
    const tests = result.oxlint.overrides.find((override) => override.name === 'tests')
    expect(tests?.plugins).toContain('vitest')
    expect(tests?.env).toEqual({ vitest: true })
  })

  it('keeps the Vue fragment apart and keeps residual off entries for overlapping globs', () => {
    const vueOverride = result.oxlint.languages
      .find((language) => language.id === 'vue')
      ?.overrides.find((override) => override.name === 'vue')
    expect(vueOverride?.rules).toEqual({ 'eslint/no-unused-vars': 'error' })
    expect(vueOverride?.plugins).toContain('vue')
    const residualYaml = result.eslint.languages.find((language) => language.id === 'yaml')
    expect(residualYaml?.rules).toEqual({ 'yaml/no-empty-key': 'off', 'yaml/sort-keys': 'error' })
    expect(result.eslint.plugins).toEqual(['vue', 'vue-a11y', 'yaml'])
  })
})

describe('generated routing', () => {
  it('assigns every Vue rule to exactly one engine', () => {
    const residualVue = residualConfiguration.languages.find((language) => language.id === 'vue')
    const residualIds = new Set(Object.keys(residualVue?.rules ?? {}))
    const vueOverride = oxlintConfiguration.languages
      .find((language) => language.id === 'vue')
      ?.overrides.find((override) => override.name === 'vue')
    const oxlintIds = new Set(
      Object.keys(vueOverride?.rules ?? {}).map((id) => normalizeRuleKey(id) ?? id),
    )

    expect(residualIds.size).toBeGreaterThan(0)
    expect(oxlintIds.size).toBeGreaterThan(0)

    for (const id of residualIds) {
      expect(oxlintIds.has(id), `${id} is in both engines`).toBe(false)
    }
  })

  it('indexes every residual rule as eslint and every Oxlint rule as oxlint', () => {
    for (const language of residualConfiguration.languages) {
      for (const id of Object.keys(language.rules)) {
        const entry = ruleIndex[id]
        expect(entry?.engine === 'eslint' || entry?.secondary?.engine === 'eslint', id).toBe(true)
      }
    }

    for (const id of Object.keys(oxlintConfiguration.rules)) {
      const canonical = normalizeRuleKey(id) ?? id
      expect(ruleIndex[canonical]?.engine, id).toBe('oxlint')
    }

    const shared = ruleIndex['depend/ban-dependencies']
    expect(shared?.engine).toBe('oxlint')
    expect(shared?.secondary).toMatchObject({ engine: 'eslint', languages: ['package-json'] })
  })
})

const severityOf = (entry: RuleEntry): RuleEntry => (Array.isArray(entry) ? entry[0] : entry)

describe('accessibility', () => {
  it('applies the one policy under every plugin that has the rule', () => {
    // the policy's names carry no plugin, so they normalize as core rules
    const policy = Object.entries(normalizeRules(rulesAccessibility))

    for (const [table, prefix, count] of [
      [typescriptRules, 'jsx_a11y', 36],
      // without jsx-a11y/autocomplete-valid and jsx-a11y/lang, which the bundle cannot carry
      [astroRules, 'astro/jsx-a11y', 34],
      [vueRules, 'vue-a11y', 22],
    ] as const) {
      const applied = policy.flatMap(([id, severity]) => {
        const entry = table[`${prefix}/${id.slice('eslint/'.length)}`]

        return entry === undefined ? [] : [[entry, severity] as const]
      })

      expect(applied).toHaveLength(count)

      for (const [entry, severity] of applied) {
        expect(severityOf(entry)).toBe(severity)
      }
    }
  })
})
