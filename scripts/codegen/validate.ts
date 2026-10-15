/*
 * Fails codegen on anything a consumer would otherwise discover at lint time:
 * unknown rules, deprecated rules, options that do not match the rule's schema,
 * and drops the capability tables do not account for.
 */
import type { JSONSchema4 } from '@typescript-eslint/utils/json-schema'
import Ajv from 'ajv'
import type { ESLint } from 'eslint'
import { unavailableReason } from '../../src/capabilities/plugins.ts'
import { extensionsOf, languages } from '../../src/configuration/languages.ts'
import type { Capabilities, RouteEntry } from '../../src/routing/types.ts'
import {
  normalizeRuleSchema,
  type LooseRuleDefinition,
} from '../../src/utilities/normalize-rule-definition.ts'
import { isRecord } from '../../src/utilities/is-record.ts'
import { pluginRule } from './plugin-modules.ts'

/** `namespace/name` of a canonical or engine id; core rules without a prefix count as `eslint`. */
export const splitRuleId = (id: string): [string, string] => {
  const index = id.indexOf('/')

  return index === -1 ? ['eslint', id] : [id.slice(0, index), id.slice(index + 1)]
}

export interface ValidationIssue {
  id: string
  message: string
}

/** A property of any rule shape, legacy function rules (which carry `schema` themselves) included. */
const propertyOf = (value: unknown, key: string): unknown =>
  (typeof value === 'object' || typeof value === 'function') && value !== null
    ? Reflect.get(value, key)
    : undefined

const ruleSchema = (definition: LooseRuleDefinition): unknown =>
  propertyOf(propertyOf(definition, 'meta'), 'schema') ?? propertyOf(definition, 'schema')

const isDeprecated = (definition: unknown): boolean => {
  const deprecated = propertyOf(propertyOf(definition, 'meta'), 'deprecated')

  return deprecated === true || (typeof deprecated === 'object' && deprecated !== null)
}

const isJsonSchema = (value: unknown): value is JSONSchema4 => isRecord(value)

const validateOptions = (
  ajv: Ajv,
  entry: RouteEntry,
  definition: LooseRuleDefinition,
): ValidationIssue | undefined => {
  if (!Array.isArray(entry.entry) || entry.entry.length <= 1) {
    return undefined
  }

  const options = entry.entry.slice(1)
  const raw = ruleSchema(definition)

  // ESLint accepts either one schema for the whole options array or one schema per option
  if (raw !== undefined && raw !== null && !Array.isArray(raw) && typeof raw === 'object') {
    const validate = ajv.compile(raw)

    return validate(options)
      ? undefined
      : { id: entry.id, message: `options rejected: ${ajv.errorsText(validate.errors)}` }
  }

  // what is left is a list of schemas, one per option, or no schema at all
  const schema = normalizeRuleSchema(
    Array.isArray(raw) ? raw.filter((item) => isJsonSchema(item)) : undefined,
  )

  if (schema.length === 0) {
    return options.length === 0
      ? undefined
      : {
          id: entry.id,
          message: `rule declares no options schema but ${options.length} option(s) are configured`,
        }
  }

  for (const [index, option] of options.entries()) {
    const item = schema[index]

    if (item === undefined) {
      return { id: entry.id, message: `option ${index + 1} has no schema slot` }
    }

    const validate = ajv.compile(item as object)

    if (!validate(option)) {
      return {
        id: entry.id,
        message: `option ${index + 1} rejected: ${ajv.errorsText(validate.errors)}`,
      }
    }
  }

  return undefined
}

/** Ids of every rule an engine can run: the native catalog plus every non-deprecated plugin rule. */
export const knownRuleIds = (
  capabilities: Capabilities,
  loaded: Map<string, ESLint.Plugin>,
): Set<string> => {
  const known = new Set<string>(capabilities.nativeRules.keys())

  for (const id of Object.keys(capabilities.aliases)) {
    known.add(id)
  }

  for (const [namespace, plugin] of loaded) {
    for (const [name, definition] of Object.entries(plugin.rules ?? {})) {
      if (isDeprecated(definition)) {
        continue
      }

      known.add(`${namespace}/${name}`)
    }
  }

  return known
}

export interface OxlintSchema {
  definitions: { DummyRuleMap: { properties: Record<string, unknown> } } & Record<string, unknown>
}

/** Validates a native rule's configured options against Oxlint's own configuration schema. */
const validateNativeOptions = (
  ajv: Ajv,
  entry: RouteEntry,
  schema: OxlintSchema,
): ValidationIssue | undefined => {
  if (!Array.isArray(entry.entry) || entry.entry.length <= 1) {
    return undefined
  }

  const key = entry.engineId.startsWith('eslint/')
    ? entry.engineId.slice('eslint/'.length)
    : entry.engineId
  const property = schema.definitions.DummyRuleMap.properties[key]

  if (!isRecord(property)) {
    return {
      id: entry.id,
      message: `native rule ${entry.engineId} has no entry in Oxlint's configuration schema`,
    }
  }

  const validate = ajv.compile({ ...property, definitions: schema.definitions })

  return validate(entry.entry)
    ? undefined
    : {
        id: entry.id,
        message: `options rejected by Oxlint's schema for ${entry.engineId}: ${ajv.errorsText(validate.errors)}`,
      }
}

/** File extensions of the languages in `ids`. */
const languageExtensions = (ids: ReadonlySet<string>): Set<string> =>
  extensionsOf(
    languages.filter((language) => ids.has(language.id)).flatMap((language) => language.files),
  )

export const validateReport = (
  report: RouteEntry[],
  capabilities: Capabilities,
  loaded: Map<string, ESLint.Plugin>,
  knownDrops: ReadonlySet<string>,
  oxlintSchema: OxlintSchema,
): ValidationIssue[] => {
  const ajv = new Ajv({ allErrors: true, logger: false, strict: false })
  const issues: ValidationIssue[] = []

  for (const entry of report) {
    const reason = unavailableReason(entry.id)
    const active = (Array.isArray(entry.entry) ? entry.entry[0] : entry.entry) !== 'off'

    if (reason !== undefined && active) {
      issues.push({ id: entry.id, message: `enabled but unavailable in the bundle: ${reason}` })
      continue
    }

    if (entry.engine === 'dropped') {
      const severity = Array.isArray(entry.entry) ? entry.entry[0] : entry.entry

      // an `off` entry with no engine loses nothing; only active rules must be accounted for
      if (severity !== 'off' && entry.reason !== 'parser-level' && !knownDrops.has(entry.id)) {
        issues.push({
          id: entry.id,
          message: `dropped (${entry.reason}) and not listed in capabilities/dropped.ts`,
        })
      }

      continue
    }

    if (entry.engine === 'oxlint' && entry.reason !== 'js-plugin') {
      if (!capabilities.nativeRules.has(entry.engineId)) {
        issues.push({
          id: entry.id,
          message: `routed to Oxlint as ${entry.engineId} but it is not in the native catalog`,
        })
        continue
      }

      const nativeIssue = validateNativeOptions(ajv, entry, oxlintSchema)

      if (nativeIssue !== undefined) {
        issues.push(nativeIssue)
      }

      continue
    }

    const [namespace, name] = splitRuleId(entry.id)
    const definition = pluginRule(loaded, namespace, name)

    if (definition === undefined) {
      issues.push({ id: entry.id, message: `rule does not exist in plugin ${namespace}` })
      continue
    }

    if (isDeprecated(definition)) {
      issues.push({ id: entry.id, message: 'rule is deprecated' })
      continue
    }

    const optionIssue = validateOptions(ajv, entry, definition)

    if (optionIssue !== undefined) {
      issues.push(optionIssue)
    }
  }

  // Exclusivity: one rule may reach both engines only on languages whose files cannot overlap
  const placements = new Map<string, Map<string, Set<string>>>()

  for (const entry of report) {
    if (entry.engine === 'dropped' || entry.group !== undefined) {
      continue
    }

    const engines = placements.get(entry.id) ?? new Map<string, Set<string>>()
    const placed = engines.get(entry.engine) ?? new Set<string>()
    placed.add(entry.language)
    engines.set(entry.engine, placed)
    placements.set(entry.id, engines)
  }

  for (const [id, engines] of placements) {
    const oxlint = engines.get('oxlint')
    const eslint = engines.get('eslint')

    if (oxlint === undefined || eslint === undefined) {
      continue
    }

    const residualExtensions = languageExtensions(eslint)
    const shared = [...languageExtensions(oxlint)].filter((extension) =>
      residualExtensions.has(extension),
    )

    if (shared.length > 0) {
      issues.push({ id, message: `routed to both engines for ${shared.join(', ')} files` })
    }
  }

  return issues
}
