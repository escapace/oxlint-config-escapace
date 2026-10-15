/*
 * Turns a route result into the committed files under src/generated.
 */
import type { ESLint } from 'eslint'
import {
  extensionsOf,
  languages,
  oxlintLintsLanguage,
  readByBothEngines,
} from '../../src/configuration/languages.ts'
import { settings } from '../../src/configuration/settings.ts'
import type { LanguageId, RuleTable } from '../../src/configuration/types.ts'
import { pluginByNamespace, plugins as pluginCapabilities } from '../../src/capabilities/plugins.ts'
import type { Capabilities, RouteResult } from '../../src/routing/types.ts'
import { installedVersion, type Features, type NativeRuleRecord } from './capabilities.ts'
import { emitJson, emitTypescript, type EmittedFile } from './emit.ts'
import { generateRuleOptions } from './rule-options.ts'
import type { OxlintSchema } from './validate.ts'

// Object keys are sorted so the generated modules satisfy perfectionist as emitted; key order never carries meaning here.
const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => sortKeys(item))
  }

  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .toSorted(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, sortKeys(item)]),
    )
  }

  return value
}

const literal = (value: unknown): string => JSON.stringify(sortKeys(value), null, 2)

const residualGroupModule = (
  language: LanguageId,
  result: RouteResult,
  loaded: Map<string, ESLint.Plugin>,
): string | undefined => {
  const output = result.eslint.languages.find((candidate) => candidate.id === language)
  const definition = languages.find((candidate) => candidate.id === language)

  if (output === undefined || definition?.eslint === undefined) {
    return undefined
  }

  const imports: string[] = []
  let usesUnwrapPlugin = false
  const pluginEntries: string[] = []
  let parser = 'undefined'
  let parserOptions = 'undefined'
  let processor = 'undefined'

  for (const namespace of output.plugins) {
    const capability = pluginByNamespace(namespace)

    if (capability === undefined) {
      throw new Error(`Residual language ${language} references unknown plugin ${namespace}`)
    }

    if (namespace === 'vue' || namespace === 'vue-a11y') {
      // every rule of the plugin, so any id the rule index accepts for a consumer can run
      const names = Object.keys(loaded.get(namespace)?.rules ?? {}).toSorted()
      const variable = namespace === 'vue' ? 'vue' : 'vueA11y'
      const entries = names.map((name, index) => {
        const identifier = `${variable}Rule${index}`
        imports.push(`import ${identifier} from '${capability.package}/dist/rules/${name}.js'`)
        return `'${name}': unwrapRule(${identifier})`
      })
      pluginEntries.push(`'${namespace}': { rules: { ${entries.join(', ')} } }`)
    } else {
      const identifier = namespace.replaceAll('-', '_')
      imports.push(`import ${identifier} from '${capability.package}'`)
      pluginEntries.push(`'${namespace}': unwrapPlugin(${identifier})`)
      usesUnwrapPlugin = true
    }
  }

  const { eslint } = definition

  if (eslint.provider.kind === 'parser') {
    imports.push(`import * as parserModule from '${eslint.provider.parser}'`)
    parser = 'parserModule'

    if (readByBothEngines(definition)) {
      // the language's scripts go to the script parser; Oxlint lints them, ESLint only walks them
      parserOptions = literal({
        ecmaVersion: 'latest',
        extraFileExtensions: [...extensionsOf(definition.files)],
        projectService: false,
        sourceType: 'module',
      })

      if (eslint.typescript === true) {
        imports.push("import * as typescriptParser from '@typescript-eslint/parser'")
        parserOptions = parserOptions.replace(
          '"projectService": false',
          '"parser": typescriptParser, "projectService": false',
        )
      }
    }
  }

  if (eslint.processor !== undefined) {
    imports.push(`import processorModule from '${eslint.processor}'`)
    processor = 'unwrapProcessor(processorModule)'
  }

  const unwrapNames = [
    ...(usesUnwrapPlugin ? ['unwrapPlugin'] : []),
    ...(eslint.processor === undefined ? [] : ['unwrapProcessor']),
    ...(output.plugins.includes('vue') ? ['unwrapRule'] : []),
  ]
  const unwrapImport =
    unwrapNames.length === 0
      ? ''
      : `import { ${unwrapNames.join(', ')} } from '../../engines/eslint/unwrap.ts'\n`

  return `${unwrapImport}${imports.join('\n')}
import type { ResidualGroup } from '../../engines/eslint/types.ts'

const group: ResidualGroup = {
  parser: ${parser},
  parserOptions: ${parserOptions},
  plugins: { ${pluginEntries.join(', ')} },
  processor: ${processor},
}

export default group
`
}

/** The version of the package that shapes what a language's processor sees: its processor's, else its parser's. */
const processedVersion = (language: (typeof languages)[number]): string => {
  const specifier =
    language.eslint?.processor ??
    (language.eslint?.provider.kind === 'parser' ? language.eslint.provider.parser : undefined)

  if (specifier === undefined) {
    throw new Error(`Language ${language.id} is read by both engines but has no ESLint parser`)
  }

  return installedVersion(
    specifier
      .split('/')
      .slice(0, specifier.startsWith('@') ? 2 : 1)
      .join('/'),
  )
}

export interface RuleIndexEntry {
  engine: 'eslint' | 'oxlint'
  engineId: string
  languages: LanguageId[]
  typeAware: boolean
  /** The other engine, when the same rule serves other languages there (depend/ban-dependencies). */
  secondary?: { engine: 'eslint' | 'oxlint'; engineId: string; languages: LanguageId[] }
}

const buildRuleIndex = (
  result: RouteResult,
  capabilities: Capabilities,
  nativeRules: NativeRuleRecord[],
  loaded: Map<string, ESLint.Plugin>,
): Record<string, RuleIndexEntry> => {
  const index: Record<string, RuleIndexEntry> = {}
  const oxlintLanguages = languages
    .filter((language) => oxlintLintsLanguage(language, capabilities.features.languagePlugins))
    .map((language) => language.id)

  for (const rule of nativeRules) {
    index[rule.id] = {
      engine: 'oxlint',
      engineId: rule.id,
      languages: oxlintLanguages,
      typeAware: rule.typeAware,
    }
  }

  for (const [canonical, target] of Object.entries(capabilities.aliases)) {
    const native = nativeRules.find((rule) => rule.id === target)
    index[canonical] = {
      engine: 'oxlint',
      engineId: target,
      languages: oxlintLanguages,
      typeAware: native?.typeAware ?? false,
    }
  }

  for (const capability of pluginCapabilities) {
    const plugin = loaded.get(capability.namespace)
    const rules = Object.keys(plugin?.rules ?? {})

    for (const name of rules) {
      const id = `${capability.namespace}/${name}`

      if (capability.unavailable?.[name] !== undefined) {
        continue
      }

      if (index[id]?.engine === 'oxlint' && capability.oxlint?.rules === undefined) {
        continue
      }

      if (
        capability.oxlint !== null &&
        (capability.oxlint.rules === undefined || capability.oxlint.rules.includes(name))
      ) {
        index[id] ??= {
          engine: 'oxlint',
          engineId: `${capability.oxlint.alias ?? capability.namespace}/${name}`,
          languages: oxlintLanguages,
          typeAware: false,
        }

        continue
      }

      if (capability.residual) {
        const residualLanguages = languages
          .filter((language) => language.eslint?.plugins.includes(capability.namespace) === true)
          .map((language) => language.id)

        index[id] ??= {
          engine: 'eslint',
          engineId: id,
          languages: residualLanguages,
          typeAware: false,
        }
      }
    }
  }

  // routed entries win over the generic placement above (for example vue rules that are native)
  // Routed language tables decide; a rule routed to both engines for different
  // languages keeps the Oxlint placement as primary and records the other one.
  interface Placement {
    engineId: string
    languages: Set<LanguageId>
    typeAware: boolean
  }
  const routed = new Map<string, Map<'eslint' | 'oxlint', Placement>>()

  for (const entry of result.report) {
    if (entry.engine === 'dropped') {
      continue
    }

    const engines = routed.get(entry.id) ?? new Map<'eslint' | 'oxlint', Placement>()
    const current: Placement = engines.get(entry.engine) ?? {
      engineId: entry.engineId,
      languages: new Set<LanguageId>(),
      typeAware: entry.reason === 'native-type-aware',
    }
    current.languages.add(entry.language)
    engines.set(entry.engine, current)
    routed.set(entry.id, engines)
  }

  for (const [id, engines] of routed) {
    const oxlint = engines.get('oxlint')
    const eslint = engines.get('eslint')
    const primary = oxlint === undefined ? 'eslint' : 'oxlint'
    const placement = oxlint ?? eslint

    if (placement === undefined) {
      continue
    }

    const secondary = primary === 'oxlint' ? eslint : undefined

    index[id] = {
      engine: primary,
      engineId: placement.engineId,
      languages: [...placement.languages],
      ...(secondary === undefined
        ? {}
        : {
            secondary: {
              engine: 'eslint',
              engineId: secondary.engineId,
              languages: [...secondary.languages],
            },
          }),
      typeAware: placement.typeAware,
    }
  }

  return Object.fromEntries(Object.entries(index).toSorted(([a], [b]) => a.localeCompare(b)))
}

export const generateFiles = async (
  result: RouteResult,
  capabilities: Capabilities,
  nativeRules: NativeRuleRecord[],
  features: Features,
  tables: Partial<Record<LanguageId, RuleTable>>,
  loaded: Map<string, ESLint.Plugin>,
  oxlintSchema: OxlintSchema,
): Promise<EmittedFile[]> => {
  const files: EmittedFile[] = []
  const ruleIndex = buildRuleIndex(result, capabilities, nativeRules, loaded)

  files.push(emitJson('src/generated/capabilities/native-rules.json', nativeRules))
  files.push(emitJson('src/generated/capabilities/features.json', features))

  for (const [language, table] of Object.entries(tables)) {
    files.push(
      await emitTypescript(
        `src/generated/rules/${language}.ts`,
        `import type { RuleTable } from '../../configuration/types.ts'\n\nexport const rules: RuleTable = ${literal(table)}\n`,
        'the composed presets and curated tables',
      ),
    )
  }

  files.push(
    await emitTypescript(
      'src/generated/oxlint-configuration.ts',
      `import type { OxlintOutput } from '../routing/types.ts'

export interface OxlintConfiguration extends OxlintOutput {
  categories: Record<string, 'error' | 'off' | 'warn'>
  settings: Record<string, unknown>
}

export const oxlintConfiguration: OxlintConfiguration = ${literal({
        categories: { correctness: 'error', suspicious: 'warn' },
        jsPlugins: result.oxlint.jsPlugins,
        languages: result.oxlint.languages,
        overrides: result.oxlint.overrides,
        plugins: result.oxlint.plugins,
        rules: result.oxlint.rules,
        settings,
        typeAwareRules: result.oxlint.typeAwareRules,
      })}
`,
      'the router',
    ),
  )

  files.push(
    await emitTypescript(
      'src/generated/residual-configuration.ts',
      `import type { ResidualOutput } from '../routing/types.ts'

export const residualConfiguration: ResidualOutput = ${literal(result.eslint)}

/** Identifies each processor for ESLint's cache and config serialisation, by the package it wraps. */
export const processorMeta: Record<string, { name: string; version: string }> = ${literal(
        Object.fromEntries(
          languages
            .filter((language) => readByBothEngines(language))
            .map((language) => [
              language.id,
              { name: `escapace/${language.id}`, version: processedVersion(language) },
            ]),
        ),
      )}
`,
      'the router',
    ),
  )

  for (const language of result.eslint.languages) {
    const body = residualGroupModule(language.id, result, loaded)

    if (body !== undefined) {
      files.push(
        await emitTypescript(`src/generated/residual-groups/${language.id}.ts`, body, 'the router'),
      )
    }
  }

  files.push(
    await emitTypescript(
      'src/generated/rule-index.ts',
      `import type { LanguageId } from '../configuration/types.ts'

export interface RuleIndexEntry {
  engine: 'eslint' | 'oxlint'
  engineId: string
  languages: LanguageId[]
  typeAware: boolean
  /** The other engine, when the same rule serves other languages there (depend/ban-dependencies). */
  secondary?: { engine: 'eslint' | 'oxlint'; engineId: string; languages: LanguageId[] }
}

export const ruleIndex: Record<string, RuleIndexEntry> = ${literal(ruleIndex)}
`,
      'the native catalog, the plugin capabilities and the router',
    ),
  )

  const ruleOptions = await generateRuleOptions(
    ruleIndex,
    capabilities,
    loaded,
    oxlintSchema,
    tables.typescript,
  )

  for (const fallback of ruleOptions.fallbacks) {
    console.warn(`codegen: ${fallback.id} options typed as unknown: ${fallback.reason}`)
  }

  files.push(...ruleOptions.files)

  return files
}
