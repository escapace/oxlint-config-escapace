/*
 * The `escapace` plugin as Node loads it, for codegen (rule existence, option
 * schemas, types). The bundle uses plugins/escapace.ts, which imports unicorn's
 * one rule file instead of the whole plugin.
 */
import unicorn from 'eslint-plugin-unicorn'
import type { ESLint } from 'eslint'
import { unwrapPlugin } from '../../eslint/unwrap.ts'
import { createEscapacePlugin } from './plugin.ts'

const nameReplacements = unwrapPlugin(unicorn).rules?.['name-replacements']

if (nameReplacements === undefined) {
  throw new Error('eslint-plugin-unicorn does not provide name-replacements')
}

const plugin: ESLint.Plugin = createEscapacePlugin(nameReplacements)

export default plugin
