import type { Linter } from 'eslint'
import { ensureDefined } from './ensure-defined.ts'
import { isRecord } from './is-record.ts'

const isConfig = (value: unknown): value is Linter.Config => isRecord(value)

/** The flat configs a plugin publishes under `configs[key]`, one or many. */
export const ensurePreset = (config: object | undefined, key: string): Linter.Config[] => {
  const value: unknown = ensureDefined(Reflect.get(ensureDefined(config), key))
  const configs: unknown[] = Array.isArray(value) ? value : [value]

  if (!configs.every((item) => isConfig(item))) {
    throw new TypeError(`Preset ${key} is not a flat config or a list of them`)
  }

  return configs
}
