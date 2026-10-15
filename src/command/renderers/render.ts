import path from 'node:path'
import { styleText } from 'node:util'
import type { Diagnostic } from './diagnostic.ts'
import { isRecord } from '../../utilities/is-record.ts'

const relative = (cwd: string, file: string): string => {
  const result = path.relative(cwd, file)

  return result === '' ? file : result
}

type Style = Parameters<typeof styleText>[0]

/** Oxlint's stylish palette, which is ESLint's: underlined file, dim position and rule, red errors, yellow warnings. */
export const renderStylish = (
  cwd: string,
  diagnostics: readonly Diagnostic[],
  colour = false,
): string => {
  const paint = (style: Style, text: string): string =>
    colour ? styleText(style, text, { validateStream: false }) : text
  const byFile = new Map<string, Diagnostic[]>()

  for (const diagnostic of diagnostics) {
    const list = byFile.get(diagnostic.filename) ?? []
    list.push(diagnostic)
    byFile.set(diagnostic.filename, list)
  }

  const lines: string[] = []

  for (const [file, list] of byFile) {
    lines.push('', paint('underline', relative(cwd, file)))

    for (const diagnostic of list) {
      const position = `${diagnostic.line}:${diagnostic.column}`
      const severity =
        diagnostic.severity === 'error' ? `${paint('red', 'error')}  ` : paint('yellow', 'warning')
      const code = diagnostic.code === undefined ? '' : `  ${paint('dim', diagnostic.code)}`
      lines.push(
        `  ${paint('dim', position)}${' '.repeat(Math.max(1, 9 - position.length))}${severity}  ${diagnostic.message}${code}`,
      )
    }
  }

  return lines.length === 0 ? '' : `${lines.join('\n')}\n`
}

// GitHub's workflow-command escaping: `%`, CR and LF in the message, also `:` and `,` in properties
const escapeData = (text: string): string =>
  text.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')

const escapeProperty = (text: string): string =>
  escapeData(text).replaceAll(':', '%3A').replaceAll(',', '%2C')

export const renderGithub = (cwd: string, diagnostics: readonly Diagnostic[]): string =>
  diagnostics
    .map((diagnostic) => {
      const file = relative(cwd, diagnostic.filename)
      const end = diagnostic.endLine === undefined ? '' : `,endLine=${diagnostic.endLine}`
      const endColumn =
        diagnostic.endColumn === undefined ? '' : `,endColumn=${diagnostic.endColumn}`
      const title = diagnostic.code === undefined ? '' : `,title=${escapeProperty(diagnostic.code)}`

      return `::${diagnostic.severity} file=${escapeProperty(file)},line=${diagnostic.line}${end},col=${diagnostic.column}${endColumn}${title}::${escapeData(`${file}:${diagnostic.line}:${diagnostic.column}: ${diagnostic.message}`)}`
    })
    .join('\n') + (diagnostics.length === 0 ? '' : '\n')

export const renderUnix = (cwd: string, diagnostics: readonly Diagnostic[]): string =>
  diagnostics
    .map((diagnostic) => {
      const severity = diagnostic.severity === 'error' ? 'Error' : 'Warning'

      return `${relative(cwd, diagnostic.filename)}:${diagnostic.line}:${diagnostic.column}: ${diagnostic.message} [${severity}/${diagnostic.code ?? 'unknown'}]`
    })
    .join('\n') + (diagnostics.length === 0 ? '' : '\n')

export interface OxlintJsonOutput {
  [key: string]: unknown
  diagnostics: Array<Record<string, unknown>>
  number_of_files: number
  /** `null` when nested configs give files different rule sets. */
  number_of_rules: number | null
}

/** Whether parsed `--format json` output has the shape esclint merges into. */
export const isOxlintJsonOutput = (value: unknown): value is OxlintJsonOutput =>
  isRecord(value) &&
  Array.isArray(value.diagnostics) &&
  value.diagnostics.every((diagnostic) => isRecord(diagnostic)) &&
  typeof value.number_of_files === 'number' &&
  (typeof value.number_of_rules === 'number' || value.number_of_rules === null)

export const toOxlintJsonDiagnostic = (
  cwd: string,
  diagnostic: Diagnostic,
): Record<string, unknown> => ({
  code: diagnostic.code,
  filename: relative(cwd, diagnostic.filename),
  help: diagnostic.help,
  labels: [
    {
      span: {
        column: diagnostic.column,
        length: diagnostic.length ?? 0,
        line: diagnostic.line,
        offset: diagnostic.offset ?? 0,
      },
    },
  ],
  message: diagnostic.message,
  severity: diagnostic.severity,
  url: undefined,
})
