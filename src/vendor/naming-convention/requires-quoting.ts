/**
 * Upstream `requiresQuoting` from `@typescript-eslint/type-utils`, without
 * TypeScript: whether a property name needs quotes, judged by ECMAScript
 * identifier syntax. Upstream checks against the program's compile target;
 * without a program it uses ESNext, which this matches.
 */
const IDENTIFIER = /^[\p{ID_Start}$_][\p{ID_Continue}$\u{200c}\u200D]*$/u

export function requiresQuoting(name: string): boolean {
  return !IDENTIFIER.test(name)
}
