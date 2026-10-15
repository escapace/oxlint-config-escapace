/**
 * Whether `value` is a plain object to read properties from: the first check
 * on anything that arrives untyped (parsed JSON, a loaded module, engine output).
 */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
