/*
 * Native Oxlint rules deliberately not preferred over their ESLint-plugin
 * version. Each entry expires: codegen fails once the installed Oxlint passes
 * `until`, forcing a re-evaluation instead of a silent decision.
 */
export interface Exclusion {
  /** Canonical rule id. */
  id: string
  /** Upstream issue or discussion that justifies the exclusion. */
  issue: string
  reason: string
  /** Oxlint version (exclusive) from which codegen refuses the exclusion. */
  until: string
}

export const exclusions: readonly Exclusion[] = []
