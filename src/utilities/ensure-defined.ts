import assert from 'node:assert'

type PathValue<T, TPath extends readonly PropertyKey[]> = TPath extends []
  ? Exclude<T, undefined>
  : TPath extends [infer THead, ...infer TTail]
    ? THead extends keyof Exclude<T, undefined>
      ? PathValue<Exclude<T, undefined>[THead], Extract<TTail, readonly PropertyKey[]>>
      : never
    : never

/**
 * Ensures that a value, or a nested value selected by path, is not `undefined`.
 *
 * @param value - Root value that must be defined.
 * @param path - Property path resolved from `value`.
 * @returns The resolved value narrowed to exclude `undefined`.
 * @throws When the resolved value is `undefined`.
 */
export function ensureDefined<T>(value: T): Exclude<T, undefined>
export function ensureDefined<T, const TPath extends readonly [PropertyKey, ...PropertyKey[]]>(
  value: T,
  ...path: TPath
): PathValue<T, TPath>
export function ensureDefined<T>(value: T, ...path: readonly PropertyKey[]): unknown {
  const pathString = path.length === 0 ? '<root>' : path.map(String).join('.')

  let current: unknown = value

  for (const key of path) {
    current = current == null ? undefined : Reflect.get(current, key)
  }

  assert(current !== undefined, `Expected value at path "${pathString}" to be defined`)

  return current
}
