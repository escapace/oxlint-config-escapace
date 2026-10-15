/*
 * The one function that assigns engines. Pure: configuration + capabilities in,
 * both engine halves and a report out. Runs at codegen; the generated
 * rule index lets the runtime route consumer entries with a dictionary lookup.
 */
import {
  oxlintLintsLanguage,
  readByBothEngines,
  type LanguageDefinition,
} from '../configuration/languages.ts'
import type { NativePlugin } from '../capabilities/native-plugins.ts'
import type { LanguageId, RuleEntry, RuleTable } from '../configuration/types.ts'
import { pluginByNamespace } from '../capabilities/plugins.ts'
import type {
  Capabilities,
  OxlintOverrideOutput,
  ResidualLanguageOutput,
  ResidualOverrideOutput,
  ResolvedConfiguration,
  RouteEntry,
  RouteResult,
} from './types.ts'

const splitId = (id: string): [namespace: string, name: string] => {
  const index = id.indexOf('/')

  return index === -1 ? ['eslint', id] : [id.slice(0, index), id.slice(index + 1)]
}

export const routeRule = (
  language: LanguageDefinition,
  id: string,
  entry: RuleEntry,
  capabilities: Capabilities,
  group?: string,
): RouteEntry => {
  const base = { entry, id, language: language.id, ...(group === undefined ? {} : { group }) }

  if (capabilities.parserLevelRules.includes(id)) {
    return { ...base, engine: 'dropped', engineId: id, reason: 'parser-level' }
  }

  const [namespace, name] = splitId(id)
  const plugin = pluginByNamespace(namespace)

  if (oxlintLintsLanguage(language, capabilities.features.languagePlugins)) {
    const aliased = capabilities.aliases[id] ?? id
    const native = capabilities.nativeRules.get(aliased)
    const excluded = capabilities.exclusions.some((exclusion) => exclusion.id === id)

    if (native !== undefined && !excluded) {
      return {
        ...base,
        engine: 'oxlint',
        engineId: aliased,
        reason: native.typeAware ? 'native-type-aware' : 'native',
      }
    }

    if (plugin?.oxlint !== null && plugin?.oxlint !== undefined) {
      const exposed = plugin.oxlint.rules === undefined || plugin.oxlint.rules.includes(name)

      if (exposed) {
        return {
          ...base,
          engine: 'oxlint',
          engineId: `${plugin.oxlint.alias ?? plugin.namespace}/${name}`,
          reason: 'js-plugin',
        }
      }

      if (!language.residual) {
        return { ...base, engine: 'dropped', engineId: id, reason: 'plugin-rule-not-exposed' }
      }
    }

    if (language.residual && plugin?.residual === true) {
      return { ...base, engine: 'eslint', engineId: id, reason: 'residual' }
    }

    return { ...base, engine: 'dropped', engineId: id, reason: 'no-engine' }
  }

  if (plugin?.residual === true) {
    return { ...base, engine: 'eslint', engineId: id, reason: 'residual' }
  }

  return { ...base, engine: 'dropped', engineId: id, reason: 'no-engine' }
}

// jsx-a11y visits JSX only, so it runs everywhere: `.jsx`, `.tsx` and JSX in Vue scripts
const BASE_NATIVE_PLUGINS: NativePlugin[] = ['eslint', 'typescript', 'unicorn', 'oxc', 'jsx-a11y']

export const route = (
  configuration: ResolvedConfiguration,
  capabilities: Capabilities,
): RouteResult => {
  const report: RouteEntry[] = []
  const oxlintRules: RuleTable = {}
  // the Oxlint rules of each language both engines read, for an override of its own
  const sharedRules = new Map<LanguageId, RuleTable>()
  const typeAwareRules = new Set<string>()
  const jsPlugins = new Map<string, string>()
  const residualLanguages: ResidualLanguageOutput[] = []
  const residualPlugins = new Set<string>()

  const noteJsPlugin = (entry: RouteEntry): void => {
    if (entry.reason !== 'js-plugin') {
      return
    }

    const [namespace] = splitId(entry.id)
    const plugin = pluginByNamespace(namespace)

    if (plugin?.oxlint !== null && plugin?.oxlint !== undefined) {
      jsPlugins.set(plugin.oxlint.alias ?? plugin.namespace, plugin.oxlint.shim)
    }
  }

  for (const language of configuration.languages) {
    const table = configuration.tables[language.id] ?? {}
    const residualRules: RuleTable = {}

    for (const [id, entry] of Object.entries(table)) {
      const routed = routeRule(language, id, entry, capabilities)
      report.push(routed)

      if (routed.engine === 'oxlint') {
        noteJsPlugin(routed)

        if (routed.reason === 'native-type-aware') {
          typeAwareRules.add(routed.engineId)
        }

        if (readByBothEngines(language)) {
          sharedRules.set(language.id, {
            ...sharedRules.get(language.id),
            [routed.engineId]: entry,
          })
        } else if (language.id === 'typescript') {
          oxlintRules[routed.engineId] = entry
        }
        // javascript shares the typescript table at the root; its differences are an override
      } else if (routed.engine === 'eslint') {
        // `off` entries stay: residual language globs overlap on purpose (`**/*.json` and
        // `**/tsconfig*.json`), and the later, more specific entry must be able to turn a rule
        // off. ESLint never validates `off` entries, so the bundle need not carry those rules.
        residualRules[routed.engineId] = entry
      }
    }

    if (language.eslint !== undefined && Object.keys(residualRules).length > 0) {
      for (const plugin of language.eslint.plugins) {
        residualPlugins.add(plugin)
      }

      residualLanguages.push({
        files: language.files,
        id: language.id,
        plugins: language.eslint.plugins,
        provider: language.eslint.provider,
        rules: residualRules,
      })
    }
  }

  const oxlintOverrides: OxlintOverrideOutput[] = []
  const sharedOverrides = new Map<LanguageId, OxlintOverrideOutput[]>()
  const residualOverrides: ResidualOverrideOutput[] = []

  const javascript = configuration.languages.find((language) => language.id === 'javascript')
  const javascriptTable = configuration.tables.javascript ?? {}
  const typescriptTable = configuration.tables.typescript ?? {}

  if (javascript !== undefined) {
    const differences: RuleTable = {}

    for (const [id, entry] of Object.entries(javascriptTable)) {
      const routed = routeRule(javascript, id, entry, capabilities)

      if (routed.engine !== 'oxlint') {
        continue
      }

      if (JSON.stringify(typescriptTable[id]) !== JSON.stringify(entry)) {
        differences[routed.engineId] = entry
      }
    }

    for (const id of typeAwareRules) {
      differences[id] = 'off'
    }

    oxlintOverrides.push({
      ...(javascript.env === undefined ? {} : { env: javascript.env }),
      files: javascript.files,
      name: 'javascript',
      rules: differences,
    })
  }

  for (const group of configuration.overrides) {
    const language = configuration.languages.find((candidate) => candidate.id === group.language)

    if (language === undefined) {
      throw new Error(`Override group ${group.name} names unknown language ${group.language}`)
    }

    const oxlintGroupRules: RuleTable = {}
    const residualGroupRules: RuleTable = {}

    for (const [id, entry] of Object.entries(group.rules)) {
      const routed = routeRule(language, id, entry, capabilities, group.name)
      report.push(routed)

      if (routed.engine === 'oxlint') {
        noteJsPlugin(routed)
        oxlintGroupRules[routed.engineId] = entry
      } else if (routed.engine === 'eslint') {
        residualGroupRules[routed.engineId] = entry
      }
    }

    if (Object.keys(oxlintGroupRules).length > 0 || group.nativePlugins !== undefined) {
      const output: OxlintOverrideOutput = {
        ...(group.env === undefined ? {} : { env: group.env }),
        files: group.files,
        name: group.name,
        ...(group.nativePlugins === undefined
          ? {}
          : { plugins: [...BASE_NATIVE_PLUGINS, ...group.nativePlugins] }),
        rules: oxlintGroupRules,
      }

      if (readByBothEngines(language)) {
        sharedOverrides.set(language.id, [...(sharedOverrides.get(language.id) ?? []), output])
      } else {
        oxlintOverrides.push(output)
      }
    }

    if (Object.keys(residualGroupRules).length > 0) {
      residualOverrides.push({
        files: group.files,
        language: group.language,
        name: group.name,
        rules: residualGroupRules,
      })
    }
  }

  return {
    eslint: {
      languages: residualLanguages,
      overrides: residualOverrides,
      plugins: [...residualPlugins].toSorted(),
    },
    oxlint: {
      jsPlugins: [...jsPlugins.entries()]
        .map(([name, shim]) => ({ name, shim }))
        .toSorted((a, b) => a.name.localeCompare(b.name)),
      languages: configuration.languages
        .filter((language) => readByBothEngines(language))
        .map((language) => ({
          id: language.id,
          overrides: [
            {
              files: language.files,
              name: language.id,
              ...(language.oxlint.plugins === undefined
                ? {}
                : { plugins: [...BASE_NATIVE_PLUGINS, ...language.oxlint.plugins] }),
              rules: sharedRules.get(language.id) ?? {},
            },
            ...(sharedOverrides.get(language.id) ?? []),
          ],
        })),
      overrides: oxlintOverrides,
      plugins: BASE_NATIVE_PLUGINS,
      rules: oxlintRules,
      typeAwareRules: [...typeAwareRules].toSorted(),
    },
    report,
  }
}
