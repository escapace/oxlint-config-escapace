/*
 * The diagnostics of esclint's `--format json` document, narrowed for the
 * specs: output of another shape fails the spec with the output itself rather
 * than with a property read on `undefined`.
 */
import { isRecord } from '../src/utilities/is-record.ts'

export interface JsonDiagnostic {
  filename: string
  message: string
  severity: string
  code?: string
}

const isJsonDiagnostic = (value: unknown): value is JsonDiagnostic =>
  isRecord(value) &&
  typeof value.filename === 'string' &&
  typeof value.message === 'string' &&
  typeof value.severity === 'string' &&
  (value.code === undefined || typeof value.code === 'string')

export const jsonDiagnostics = (stdout: string): JsonDiagnostic[] => {
  const output: unknown = JSON.parse(stdout)
  const entries: unknown = isRecord(output) ? output.diagnostics : undefined
  const diagnostics: unknown[] = Array.isArray(entries) ? entries : []

  if (!Array.isArray(entries) || !diagnostics.every((entry) => isJsonDiagnostic(entry))) {
    throw new Error(`Expected esclint's JSON output, got:\n${stdout}`)
  }

  return diagnostics
}
