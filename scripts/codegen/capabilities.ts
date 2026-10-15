import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { aliases } from '../../src/capabilities/aliases.ts'
import { exclusions } from '../../src/capabilities/exclusions.ts'
import { parserLevelRules } from '../../src/capabilities/parser-level.ts'
import { plugins } from '../../src/capabilities/plugins.ts'
import type { Capabilities, NativeRule } from '../../src/routing/types.ts'
import { isRecord } from '../../src/utilities/is-record.ts'
import { packageVersion, readJson } from '../../src/utilities/read-json.ts'
import { oxlintBinary, rootDirectory } from './paths.ts'

const require = createRequire(import.meta.url)

export interface Features {
  languagePlugins: boolean
  oxlintVersion: string
  tsgolintVersion: string
}

export interface NativeRuleRecord {
  category: string
  default: boolean
  fix: string
  id: string
  scope: string
  typeAware: boolean
  value: string
}

interface CatalogEntry {
  category: string
  default: boolean
  fix: string
  scope: string
  type_aware: boolean
  value: string
  docs_url?: string
}

const isCatalogEntry = (value: unknown): value is CatalogEntry =>
  isRecord(value) &&
  typeof value.category === 'string' &&
  typeof value.default === 'boolean' &&
  typeof value.fix === 'string' &&
  typeof value.scope === 'string' &&
  typeof value.type_aware === 'boolean' &&
  typeof value.value === 'string' &&
  (value.docs_url === undefined || typeof value.docs_url === 'string')

export const readNativeRules = (): NativeRuleRecord[] => {
  const output = execFileSync(oxlintBinary, ['--rules', '--format', 'json'], {
    cwd: rootDirectory,
    encoding: 'utf8',
  })
  const catalog: unknown = JSON.parse(output)
  const entries = Array.isArray(catalog) ? catalog.filter((entry) => isCatalogEntry(entry)) : []

  if (!Array.isArray(catalog) || entries.length !== catalog.length) {
    throw new Error(
      '`oxlint --rules --format json` changed shape: expected an array of { scope, value, category, type_aware, fix, default }',
    )
  }

  return entries
    .map((entry) => ({
      category: entry.category,
      default: entry.default,
      fix: entry.fix,
      id: `${entry.scope}/${entry.value}`,
      scope: entry.scope,
      typeAware: entry.type_aware,
      value: entry.value,
    }))
    .toSorted((a, b) => a.id.localeCompare(b.id))
}

const readConfigurationSchema = (): Record<string, unknown> => {
  const schema = readJson(
    path.join(path.dirname(require.resolve('oxlint/package.json')), 'configuration_schema.json'),
  )

  if (!isRecord(schema)) {
    throw new Error("Oxlint's configuration_schema.json is not a JSON object")
  }

  return schema
}

export const readOxlintSchema = (): {
  definitions: { DummyRuleMap: { properties: Record<string, unknown> } } & Record<string, unknown>
} => {
  const { definitions } = readConfigurationSchema()
  const ruleMap = isRecord(definitions) ? definitions.DummyRuleMap : undefined

  if (!isRecord(definitions) || !isRecord(ruleMap) || !isRecord(ruleMap.properties)) {
    throw new Error(
      "Oxlint's configuration_schema.json changed shape: expected definitions.DummyRuleMap.properties",
    )
  }

  return {
    definitions: { ...definitions, DummyRuleMap: { ...ruleMap, properties: ruleMap.properties } },
  }
}

/** The version of the installed package `name`, as codegen resolves it. */
export const installedVersion = (name: string): string => {
  const version = packageVersion(require.resolve(`${name}/package.json`))

  if (version === undefined) {
    throw new Error(`${name}/package.json names no version`)
  }

  return version
}

export const readFeatures = (): Features => {
  const { properties } = readConfigurationSchema()

  return {
    languagePlugins: isRecord(properties) && properties.languagePlugins !== undefined,
    oxlintVersion: installedVersion('oxlint'),
    tsgolintVersion: installedVersion('oxlint-tsgolint'),
  }
}

export const assertExclusionsCurrent = (features: Features): void => {
  const [major, minor, patch] = features.oxlintVersion.split('.').map(Number)
  const current = (major ?? 0) * 1_000_000 + (minor ?? 0) * 1000 + (patch ?? 0)

  for (const exclusion of exclusions) {
    const [untilMajor, untilMinor, untilPatch] = exclusion.until.split('.').map(Number)
    const until = (untilMajor ?? 0) * 1_000_000 + (untilMinor ?? 0) * 1000 + (untilPatch ?? 0)

    if (current >= until) {
      throw new Error(
        `Exclusion of ${exclusion.id} expired at Oxlint ${exclusion.until} (installed ${features.oxlintVersion}); re-evaluate it (${exclusion.issue})`,
      )
    }
  }
}

export const createCapabilities = (
  nativeRules: NativeRuleRecord[],
  features: Features,
): Capabilities => ({
  aliases,
  exclusions,
  features: { languagePlugins: features.languagePlugins },
  nativeRules: new Map<string, NativeRule>(
    nativeRules.map((rule) => [
      rule.id,
      { category: rule.category, id: rule.id, typeAware: rule.typeAware },
    ]),
  ),
  oxlintVersion: features.oxlintVersion,
  parserLevelRules,
  plugins,
})
