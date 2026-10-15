import type { Linter } from 'eslint'

export function extractRules(
  ...configs: Array<Linter.Config | readonly Linter.Config[] | undefined>
): Array<Partial<Linter.RulesRecord> | undefined> {
  return configs
    .flat()
    .filter((value): value is Linter.Config => value !== undefined)
    .map((value) => value.rules)
}
