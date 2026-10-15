import { ignorePatterns } from '../../src/configuration/ignores.ts'
import { languages } from '../../src/configuration/languages.ts'
import { overrideGroups } from '../../src/configuration/overrides.ts'
import { settings } from '../../src/configuration/settings.ts'
import type { RuleTable } from '../../src/configuration/types.ts'
import { normalizeRules } from '../../src/utilities/normalize-rules.ts'
import type { ResolvedConfiguration } from '../../src/routing/types.ts'
import type { ComposedTables } from './presets.ts'

/** An `off` entry for a rule no engine knows is a leftover from an upstream preset; both engines would reject the name. */
const pruneUnknownDisables = (table: RuleTable, isKnown: (id: string) => boolean): RuleTable =>
  Object.fromEntries(
    Object.entries(table).filter(([id, entry]) => {
      const severity = Array.isArray(entry) ? entry[0] : entry

      return severity !== 'off' || isKnown(id)
    }),
  )

export const resolveConfiguration = (
  composed: ComposedTables,
  isKnown: (id: string) => boolean,
): ResolvedConfiguration => ({
  ignorePatterns,
  languages,
  overrides: overrideGroups.map((group) =>
    group.vitest === true
      ? { ...group, rules: pruneUnknownDisables(composed.vitest, isKnown) }
      : { ...group, rules: normalizeRules(group.rules) },
  ),
  settings,
  tables: Object.fromEntries(
    Object.entries(composed.tables).map(([language, table]) => [
      language,
      pruneUnknownDisables(table, isKnown),
    ]),
  ),
})
