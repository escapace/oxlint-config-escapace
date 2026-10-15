// `Object.create` returns `any`; what it builds inherits every member of its prototype
const create: <T extends object>(prototype: T, properties: PropertyDescriptorMap) => T =
  Object.create

/**
 * An object that inherits everything from `base` and shadows the members in
 * `overrides`, such as a rule context with other options or another `report`.
 * It works on frozen objects (ESLint freezes rule contexts), where a Proxy may
 * not hand out other values.
 */
export const inherit = <T extends object>(base: T, overrides: Partial<T>): T =>
  create(
    base,
    Object.fromEntries(
      Object.entries(overrides).map(([key, value]) => [key, { enumerable: true, value }]),
    ),
  )
