/*
 * Oxlint's native plugins, as its config names them. The record must list
 * every name Oxlint's types allow and no other, so an Oxlint upgrade that adds
 * or drops one fails the type check here.
 */
import type { OxlintConfig } from 'oxlint'

export type NativePlugin = NonNullable<OxlintConfig['plugins']>[number]

const NATIVE_PLUGINS: Record<NativePlugin, true> = {
  'eslint': true,
  'import': true,
  'jest': true,
  'jsdoc': true,
  'jsx-a11y': true,
  'nextjs': true,
  'node': true,
  'oxc': true,
  'promise': true,
  'react': true,
  'react-perf': true,
  'typescript': true,
  'unicorn': true,
  'vitest': true,
  'vue': true,
}

export const isNativePlugin = (name: string): name is NativePlugin =>
  Object.hasOwn(NATIVE_PLUGINS, name)
