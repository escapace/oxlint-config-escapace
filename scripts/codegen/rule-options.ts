/*
 * Rule option types. JS-plugin and residual rules get one module per option
 * slot, compiled from the plugin's `meta.schema` with json-schema-to-typescript;
 * native rules reuse Oxlint's own types. `Rules` keys every routed rule by its
 * canonical id. Codegen only.
 */
import type { ESLint } from 'eslint'
import { Linter } from 'eslint'
import typescriptParser from '@typescript-eslint/parser'
import { settings } from '../../src/configuration/settings.ts'
import type { RuleTable } from '../../src/configuration/types.ts'
import type { Capabilities } from '../../src/routing/types.ts'
import {
  normalizeRuleDefinition,
  type LooseRuleDefinition,
  type LooseRuleMetaData,
} from '../../src/utilities/normalize-rule-definition.ts'
import { emitTypescript, type EmittedFile } from './emit.ts'
import { pluginRule } from './plugin-modules.ts'
import { splitRuleId, type OxlintSchema } from './validate.ts'

const DIRECTORY = 'src/generated/rule-options'
const ORDINALS = ['primary', 'secondary', 'tertiary']

export interface RuleIndexLike {
  engine: 'eslint' | 'oxlint'
  engineId: string
}

export interface RuleOptionsResult {
  /** Canonical ids whose schema could not be converted and fell back to `unknown[]` options. */
  fallbacks: Array<{ id: string; reason: string }>
  files: EmittedFile[]
}

interface RulesMember {
  comment: string[]
  entry: string
  id: string
  imports: Array<{ file: string; name: string }>
}

/** The Oxlint `DummyRuleMap` key of a native rule: core rules drop `eslint/`, scopes use `-`. */
const nativeKey = (engineId: string, schema: OxlintSchema): string | undefined => {
  const [scope, name] = splitRuleId(engineId)
  const candidates =
    scope === 'eslint' ? [name] : [engineId, `${scope.replaceAll('_', '-')}/${name}`]

  return candidates.find((candidate) =>
    Object.hasOwn(schema.definitions.DummyRuleMap.properties, candidate),
  )
}

const slug = (id: string): string =>
  id
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')

const rawSchema = (definition: LooseRuleDefinition): LooseRuleMetaData['schema'] =>
  typeof definition === 'function' ? undefined : (definition?.meta?.schema ?? definition?.schema)

// Syntax-only fixable rules from the TypeScript table that the emitted modules are run through, so they lint clean as generated.
const FIXER_RULES = new Set(['typescript/array-type'])
const isFixerRule = (id: string): boolean => id.startsWith('perfectionist/') || FIXER_RULES.has(id)

/** Rewrites member order and array notation the way the package's own settings want them. */
const createFixer = (
  loaded: Map<string, ESLint.Plugin>,
  table: RuleTable | undefined,
): ((code: string, filename: string) => string) => {
  const perfectionist = loaded.get('perfectionist')
  const typescript = loaded.get('typescript')

  if (perfectionist === undefined || typescript === undefined || table === undefined) {
    return (code) => code
  }

  const rules = Object.fromEntries(
    Object.entries(table).filter(([id]) => isFixerRule(id)),
  ) as Linter.RulesRecord
  const linter = new Linter()
  const config: Linter.Config[] = [
    {
      files: ['**/*.ts'],
      languageOptions: {
        parser: typescriptParser,
        parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
      },
      plugins: { perfectionist, typescript },
      rules,
      settings,
    },
  ]

  return (code, filename) => linter.verifyAndFix(code, config, { filename }).output
}

const member = async (
  id: string,
  definition: LooseRuleDefinition,
): Promise<{ files: Array<{ content: string; file: string }>; member: RulesMember }> => {
  const raw = rawSchema(definition)
  const normalized = await normalizeRuleDefinition(id, definition)
  const { descriptionTypescript, typescript } = normalized.meta
  const slots = typescript.map((slot, index) => ({
    ...slot,
    file: `rule-${slug(id)}${typescript.length > 1 ? `-${ORDINALS[index]}` : ''}-options`,
  }))
  const imports = slots.map(({ file, name }) => ({ file, name }))

  if (slots.length === 0) {
    return {
      files: [],
      member: { comment: descriptionTypescript, entry: 'RuleEntryInput<[]>', id, imports },
    }
  }

  // an array schema lists one schema per positional option; an object schema describes the whole options array
  const entry = Array.isArray(raw)
    ? `RuleEntryInput<[${slots.map((slot) => `${slot.name}?`).join(', ')}]>`
    : `RuleEntryInput<RuleOptionsInput<${slots[0]?.name}>>`

  return {
    files: slots.map((slot) => ({ content: slot.value, file: slot.file })),
    member: { comment: descriptionTypescript, entry, id, imports },
  }
}

const quote = (value: string): string => `'${value.replaceAll("'", String.raw`\'`)}'`

export const generateRuleOptions = async (
  index: Record<string, RuleIndexLike>,
  capabilities: Capabilities,
  loaded: Map<string, ESLint.Plugin>,
  oxlintSchema: OxlintSchema,
  typescriptTable: RuleTable | undefined,
): Promise<RuleOptionsResult> => {
  const sort = createFixer(loaded, typescriptTable)
  const members: RulesMember[] = []
  const files: EmittedFile[] = []
  const seen = new Map<string, string>()
  const fallbacks: RuleOptionsResult['fallbacks'] = []
  let usesNative = false
  let usesWhole = false

  const emitSlot = async (id: string, file: string, content: string): Promise<void> => {
    const owner = seen.get(file)

    if (owner !== undefined && owner !== id) {
      throw new Error(`Rule option module ${file} is claimed by both ${owner} and ${id}`)
    }

    seen.set(file, id)
    const relativePath = `${DIRECTORY}/${file}.ts`
    files.push(await emitTypescript(relativePath, `${content}\n`, 'the plugin rule schema', sort))
  }

  for (const [id, entry] of Object.entries(index).toSorted(([a], [b]) => a.localeCompare(b))) {
    if (entry.engine === 'oxlint' && capabilities.nativeRules.has(entry.engineId)) {
      const key = nativeKey(entry.engineId, oxlintSchema)

      if (key === undefined) {
        fallbacks.push({
          id,
          reason: `native rule ${entry.engineId} has no entry in Oxlint's types`,
        })
        members.push({ comment: [], entry: 'RuleEntryInput', id, imports: [] })
        continue
      }

      usesNative = true
      members.push({
        comment: [],
        entry: `NativeRuleEntryInput<NativeRules[${quote(key)}]>`,
        id,
        imports: [],
      })
      continue
    }

    const [namespace, name] = splitRuleId(id)
    const definition = pluginRule(loaded, namespace, name)

    try {
      const result = await member(id, definition)

      for (const file of result.files) {
        await emitSlot(id, file.file, file.content)
      }

      usesWhole ||= result.member.entry.includes('RuleOptionsInput<')
      members.push(result.member)
    } catch (error) {
      fallbacks.push({ id, reason: error instanceof Error ? error.message : String(error) })
      members.push({ comment: [], entry: 'RuleEntryInput', id, imports: [] })
    }
  }

  const typeImports = [
    'RuleEntryInput',
    ...(usesNative ? ['NativeRuleEntryInput'] : []),
    ...(usesWhole ? ['RuleOptionsInput'] : []),
  ].toSorted((a, b) => a.localeCompare(b))
  const body = [
    ...(usesNative ? ["import type { OxlintConfig } from 'oxlint'"] : []),
    `import type { ${typeImports.join(', ')} } from '../configuration/types.ts'`,
    ...members.flatMap((item) =>
      item.imports.map(
        (value) => `import type { ${value.name} } from './rule-options/${value.file}.ts'`,
      ),
    ),
    '',
    ...(usesNative ? ["type NativeRules = NonNullable<OxlintConfig['rules']>", ''] : []),
    '/** Every rule either engine runs, keyed by canonical id; unknown ids are accepted untyped. */',
    'export interface Rules extends Partial<Record<string, RuleEntryInput>> {',
    ...members.flatMap((item) => [...item.comment, `${quote(item.id)}?: ${item.entry}`]),
    '}',
    '',
  ].join('\n')
  const rulesPath = 'src/generated/rules.ts'

  files.push(
    await emitTypescript(rulesPath, body, "the plugin rule schemas and Oxlint's types", sort),
  )

  return { fallbacks, files }
}
