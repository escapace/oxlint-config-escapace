import type { RuleTableInput } from '../types.ts'

export const rulesTomlIncluded: RuleTableInput = {
  'toml/array-bracket-spacing': ['error', 'never'],
  // oxfmt collapses short arrays onto one line and undoes this rule's fix
  'toml/array-element-newline': 'off',
  // TOML 1.0 forbids line breaks inside inline tables, so these fixes break the file for
  // tomllib, pip and Cargo
  'toml/inline-table-curly-newline': 'off',
  'toml/inline-table-key-value-newline': 'off',
}
