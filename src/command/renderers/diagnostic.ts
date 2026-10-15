/** Engine-neutral diagnostic the residual renderers work from, shaped after Oxlint's JSON output. */
export interface Diagnostic {
  column: number
  endColumn: number | undefined
  endLine: number | undefined
  filename: string
  /** `plugin(rule)`, Oxlint's spelling. */
  code: string | undefined
  help: string | undefined
  /** Characters from `offset` to the end position, for tools that place diagnostics by offset. */
  length: number | undefined
  line: number
  message: string
  offset: number | undefined
  severity: 'error' | 'warning'
}

export const toOxlintCode = (ruleId: string | null | undefined): string | undefined => {
  if (ruleId === null || ruleId === undefined) {
    return undefined
  }

  const index = ruleId.indexOf('/')

  return index === -1
    ? `eslint(${ruleId})`
    : `${ruleId.slice(0, index)}(${ruleId.slice(index + 1)})`
}
