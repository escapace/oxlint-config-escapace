import type { JSONSchema4 } from '@typescript-eslint/utils/json-schema'
import type { Rule } from 'eslint'
import { compile } from 'json-schema-to-typescript'
import { isFunction, isObject, isPlainObject, mapKeys, omit } from 'es-toolkit/compat'
import assert from 'node:assert'
import { clean } from 'trigram-utils'
import { isRecord } from './is-record.ts'
import { toTypeName } from './to-type-name.ts'

// oxlint-disable-next-line typescript/no-explicit-any, typescript/no-unsafe-function-type
export type LooseRuleCreateFunction = (context: any) => Record<string, Function | undefined>

/** `function_` applied to every primitive of `value` with its key, through arrays and plain objects. */
const mapValuesDeep = (
  value: unknown,
  function_: (value: unknown, key: unknown) => unknown,
  key?: unknown,
): unknown => {
  if (Array.isArray(value)) {
    return value.map((item: unknown, index) => mapValuesDeep(item, function_, index))
  }

  if (isPlainObject(value) && isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([itemKey, item]) => [
        itemKey,
        mapValuesDeep(item, function_, itemKey),
      ]),
    )
  }

  return isObject(value) ? value : function_(value, key)
}

// a schema object maps to a plain object again
const isJsonSchema = (value: unknown): value is JSONSchema4 => isRecord(value)

const ordinalSeries = new Map<number, string>([
  [1, 'Primary'],
  [2, 'Secondary'],
  [3, 'Tertiary'],
])

const patchVitestValidTitleTypes = (key: string, value: string): string => {
  if (key !== 'vitest/valid-title') {
    return value
  }

  const token = '[k: string]:'
  const start = value.indexOf(token)
  const end = value.lastIndexOf('\n}')

  if (start === -1 || end === -1 || end <= start) {
    return value
  }

  const before = value.slice(0, start + token.length)
  const indexType = value.slice(start + token.length, end).trim()
  const after = value.slice(end)

  return `${before} (${indexType}) | boolean | string[] | undefined${after}`
}

const ordinalName = (index: number) => {
  const ordinal = ordinalSeries.get(index)
  assert(ordinal !== undefined)

  return ordinal
}

export const normalizeRuleSchema = (input: Rule.RuleMetaData['schema']): JSONSchema4[] => {
  const raw = input ?? []
  const schemas = (Array.isArray(raw) ? raw : [raw]).filter(
    (value): value is JSONSchema4 => value !== false,
  )

  return schemas.map((value) => {
    const schema = mapValuesDeep(
      omit(
        mapKeys(value, (_, key) =>
          key === 'definitions' ? '$defs' : key === '$definitions' ? '$defs' : key,
        ),
        ['id'],
      ),
      (value: unknown, key) =>
        key === '$ref' && typeof value === 'string'
          ? value.replace(/(#\/definitions\/|#\/items\/\d+\/\$defs\/)/i, `#/$defs/`)
          : value,
    )
    assert(isJsonSchema(schema), 'a rule schema maps to a schema object')

    return schema
  })
}

export type LooseRuleDefinition =
  | LooseRuleCreateFunction
  | {
      meta?: LooseRuleMetaData | undefined
      schema?: LooseRuleMetaData['schema']
    }
  | undefined

export type LooseRuleMetaData = {
  deprecated?: boolean | object | undefined
  docs?: Pick<Exclude<Rule.RuleMetaData['docs'], undefined>, 'description' | 'url'> | undefined
} & Omit<Rule.RuleMetaData, 'deprecated' | 'docs'>

export interface RuleDefinition {
  meta: {
    deprecated: boolean
    description: string | undefined
    descriptionTypescript: string[]
    fixable: string | undefined
    schema: JSONSchema4[]
    type: string | undefined
    typescript: Array<{
      name: string
      value: string
    }>
    url: string | undefined
  }
}

export const normalizeRuleDefinition = async (
  key: string,
  value: LooseRuleDefinition,
): Promise<RuleDefinition> => {
  assert(!isFunction(value), `${key} LooseRuleCreateFunction not supported`)

  const schema = normalizeRuleSchema(value?.meta?.schema ?? value?.schema)
  const typescript: Array<{ name: string; value: string }> = []
  const description = value?.meta?.docs?.description
  const url = value?.meta?.docs?.url

  const descriptionTypescript =
    typeof description === 'string'
      ? typeof url === 'string'
        ? ['/**', ` * ${clean(description)}`, ` *`, ` * ${url}`, ' */']
        : ['/**', ` * ${clean(description)}`, ' */']
      : typeof url === 'string'
        ? ['/**', ` * ${url}`, ' */']
        : []

  for (const [ordinal, _schema] of schema.map((value, index) => [index + 1, value] as const)) {
    try {
      const name =
        schema.length > 1
          ? `Rule${toTypeName(key)}${ordinalName(ordinal)}Options`
          : `Rule${toTypeName(key)}Options`

      const lines = patchVitestValidTitleTypes(
        key,
        await compile(_schema, name, {
          bannerComment: '',
          declareExternallyReferenced: true,
          format: false,
          strictIndexSignatures: true,
        }),
      ).split(/\r?\n/)

      const index = lines.findLastIndex((line) =>
        new RegExp(`export (?:interface|type) ${name}`, 'i').test(line),
      )

      assert(index !== -1)

      lines.splice(index, 0, ...descriptionTypescript)

      typescript.push({ name, value: lines.join('\n') })
    } catch (error) {
      throw new Error(
        `${key}: option ${ordinal} schema cannot be converted: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      )
    }
  }

  return {
    meta: {
      deprecated: value?.meta?.deprecated === true || isPlainObject(value?.meta?.deprecated),
      description,
      descriptionTypescript,
      fixable: value?.meta?.fixable,
      schema,
      type: value?.meta?.type,
      typescript,
      url,
    },
  }
}
