/*
 * Bundled shim for the `escapace` plugin. unicorn's rule file is imported
 * directly so the bundle carries one rule, not 130; unicorn's own
 * `toEslintRule` wrapper turns its internal rule shape into an ESLint rule.
 */
import type { ESLint } from 'eslint'
import toEslintRule from 'eslint-plugin-unicorn/rules/rule/to-eslint-rule.js'
import nameReplacements from 'eslint-plugin-unicorn/rules/name-replacements.js'
import { createEscapacePlugin } from '../escapace/plugin.ts'

const shim: ESLint.Plugin = createEscapacePlugin(
  toEslintRule('name-replacements', nameReplacements),
)

export default shim
