import { renamedRules } from '../capabilities/aliases.ts'
import type { RuleEntry, RuleSeverityInput, RuleTableInput } from '../configuration/types.ts'

const levelToString = (key: string, value: RuleSeverityInput): 'error' | 'off' | 'warn' => {
  switch (value) {
    case 0:
    case 'allow':
    case 'off':
      return 'off'
    case 1:
    case 'warn':
      return 'warn'
    case 2:
    case 'deny':
    case 'error':
      return key.startsWith('perfectionist/') ? 'warn' : 'error'
    default:
      throw new TypeError(`Unknown severity ${String(value)} for ${key}`)
  }
}

// Every accepted spelling of a plugin prefix maps to the canonical one; a core
// rule without a prefix becomes `eslint/<rule>` so that no id is ever ambiguous
// (`no-negated-condition` exists in both eslint and unicorn).
const ruleKeyAliases: Array<[prefix: string, replacement: string | undefined]> = [
  ['@babel', undefined],
  ['react', undefined],
  ['@typescript-eslint', 'typescript'],
  ['typescript-eslint', 'typescript'],
  ['vuejs-accessibility', 'vue-a11y'],
  ['yml', 'yaml'],
  // Oxlint's documentation spells these with a hyphen; its catalog scope uses an underscore
  ['jsx-a11y', 'jsx_a11y'],
  ['react-perf', 'react_perf'],
  ['jsonc', 'json'],
  ['@stylistic', 'stylistic'],
]

const prefixed = (key: string): string | undefined => {
  const alias = ruleKeyAliases.find(([prefix]) => key.startsWith(`${prefix}/`))

  if (alias === undefined) {
    return key.includes('/') ? key : `eslint/${key}`
  }

  const [prefix, replacement] = alias

  return replacement === undefined ? undefined : `${replacement}${key.slice(prefix.length)}`
}

/** The canonical id of any accepted spelling, including rules that moved (`renamedRules`). */
export const normalizeRuleKey = (key: string): string | undefined => {
  const canonical = prefixed(key)

  return canonical === undefined ? undefined : (renamedRules[canonical] ?? canonical)
}

/** The new id of a rule that moved (`renamedRules`), for any accepted spelling of its old one. */
export const movedRuleKey = (key: string): string | undefined => {
  const canonical = prefixed(key)

  return canonical === undefined ? undefined : renamedRules[canonical]
}

export const normalizeRules = (
  ...rules: Array<RuleTableInput | undefined>
): Record<string, RuleEntry> => {
  if (rules.length === 0) {
    return {}
  }

  // later tables win, as with Object.assign
  const merged: RuleTableInput = Object.fromEntries(
    rules.flatMap((table) => (table === undefined ? [] : Object.entries(table))),
  )

  return Object.fromEntries(
    Object.entries(merged).flatMap(([rawKey, value]): Array<[string, RuleEntry]> => {
      const key = normalizeRuleKey(rawKey)

      if (value === undefined || key === undefined) {
        return []
      }

      if (Array.isArray(value)) {
        const [level, ...options] = value

        return [[key, [levelToString(key, level), ...options]]]
      }

      return [[key, levelToString(key, value)]]
    }),
  )
}
