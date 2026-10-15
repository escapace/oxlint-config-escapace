/*
 * Which engine owns a rule named in a disable comment of a file both engines
 * lint (`.vue`). One predicate for the Oxlint rule that renames comments and
 * for the residual that drops ESLint's reports on them, so the two never
 * disagree.
 */
import type { LanguageId } from '../configuration/types.ts'
import { ruleIndex } from '../generated/rule-index.ts'
import { normalizeRuleKey } from './normalize-rules.ts'

/**
 * Whether Oxlint, and not ESLint, runs `id` on a file of `language`, which both
 * engines read: Oxlint lints the scripts with all its rules (the index lists
 * their own languages, not `language`), ESLint the rules it maps for `language`.
 */
export const oxlintRunsIn = (language: LanguageId, id: string): boolean => {
  const entry = ruleIndex[normalizeRuleKey(id) ?? id]
  const mappings =
    entry === undefined ? [] : [entry, ...(entry.secondary === undefined ? [] : [entry.secondary])]

  return (
    mappings.some((mapping) => mapping.engine === 'oxlint') &&
    !mappings.some((mapping) => mapping.engine === 'eslint' && mapping.languages.includes(language))
  )
}
