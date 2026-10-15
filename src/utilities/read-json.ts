import { readFileSync } from 'node:fs'
import { isRecord } from './is-record.ts'

/** A JSON file's contents, `unknown` until a guard narrows them. */
export const readJson = (file: string | URL): unknown => JSON.parse(readFileSync(file, 'utf8'))

/** The `version` of the package manifest at `file`, if it names one. */
export const packageVersion = (file: string | URL): string | undefined => {
  const manifest = readJson(file)

  return isRecord(manifest) && typeof manifest.version === 'string' ? manifest.version : undefined
}
