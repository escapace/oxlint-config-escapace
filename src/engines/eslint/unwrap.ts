import type { ESLint, Linter, Rule } from 'eslint'
import { isRecord } from '../../utilities/is-record.ts'

const defaultOf = (module: unknown): unknown => (isRecord(module) ? module.default : undefined)

/**
 * CJS/ESM interop: the `default` export's own `default` (CommonJS compiled from
 * ESM), the `default` export or the module itself, the first `accepts` passes.
 */
const unwrapDefault = <T>(
  module: unknown,
  accepts: (value: unknown) => value is T,
): T | undefined =>
  [defaultOf(defaultOf(module)), defaultOf(module), module].find((candidate) => accepts(candidate))

const isPlugin = (value: unknown): value is ESLint.Plugin =>
  isRecord(value) && isRecord(value.rules)

const isRule = (value: unknown): value is Rule.RuleModule =>
  isRecord(value) && typeof value.create === 'function'

const isProcessor = (value: unknown): value is Linter.Processor =>
  isRecord(value) && typeof value.preprocess === 'function'

/** CJS/ESM interop for plugin modules imported from the bundle. */
export const unwrapPlugin = (module: unknown): ESLint.Plugin => {
  const plugin = unwrapDefault(module, isPlugin)

  if (plugin === undefined) {
    throw new TypeError('Expected an ESLint plugin module')
  }

  return plugin
}

/** CJS/ESM interop for a single rule module imported by its file path. */
export const unwrapRule = (module: unknown): Rule.RuleModule => {
  const rule = unwrapDefault(module, isRule)

  if (rule === undefined) {
    throw new TypeError('Expected an ESLint rule module')
  }

  return rule
}

/** CJS/ESM interop for a processor module imported by its file path. */
export const unwrapProcessor = (module: unknown): Linter.Processor => {
  const processor = unwrapDefault(module, isProcessor)

  if (processor === undefined) {
    throw new TypeError('Expected an ESLint processor module')
  }

  return processor
}
