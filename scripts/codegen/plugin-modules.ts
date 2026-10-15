/*
 * Loads every ESLint plugin this package knows about, for preset composition,
 * rule existence checks, option schemas and type generation. Codegen only.
 */
import path from 'node:path'
import type { ESLint, Linter } from 'eslint'
import { plugins } from '../../src/capabilities/plugins.ts'
import { unwrapPlugin } from '../../src/engines/eslint/unwrap.ts'
import type { LooseRuleDefinition } from '../../src/utilities/normalize-rule-definition.ts'

const importPlugin = async (specifier: string): Promise<ESLint.Plugin> => {
  if (specifier.startsWith('./')) {
    return unwrapPlugin(
      await import(new URL(`../../${specifier.slice(2)}/index.ts`, import.meta.url).href),
    )
  }

  return unwrapPlugin(await import(specifier))
}

export const loadPlugins = async (): Promise<Map<string, ESLint.Plugin>> => {
  const loaded = new Map<string, ESLint.Plugin>()

  for (const capability of plugins) {
    loaded.set(capability.namespace, await importPlugin(capability.package))
  }

  return loaded
}

export const pluginRule = (
  loaded: Map<string, ESLint.Plugin>,
  namespace: string,
  name: string,
): LooseRuleDefinition | undefined => {
  const rules = loaded.get(namespace)?.rules as Record<string, LooseRuleDefinition> | undefined

  return rules?.[name]
}

/**
 * The rule tables of a preset's entries. With `filename`, only the entries
 * that apply to it: a preset may scope entries with `files`, as
 * typescript-eslint's `eslint-recommended` does for TypeScript files only.
 */
export const presetRules = (
  config: Linter.Config | readonly Linter.Config[] | undefined,
  filename?: string,
): Array<Partial<Linter.RulesRecord>> =>
  (Array.isArray(config) ? config : [config])
    .filter((value): value is Linter.Config => value !== undefined && value !== null)
    .filter(
      (value) =>
        filename === undefined ||
        value.files === undefined ||
        value.files
          .flat()
          .some((pattern) => typeof pattern === 'string' && path.matchesGlob(filename, pattern)),
    )
    .map((value) => value.rules ?? {})
