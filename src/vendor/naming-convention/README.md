# Vendored naming-convention agent notes

## Purpose

This directory vendors typescript-eslint's `naming-convention` rule without TypeScript, for the `escapace` Oxlint plugin (`escapace/naming-convention`). Oxlint gives JS plugins no type information, and the upstream rule loads the TypeScript compiler at import time only to serve its type-based options.

Upstream source: https://github.com/typescript-eslint/typescript-eslint/tree/v8.71.1/packages/eslint-plugin/src/rules/naming-convention.ts and `naming-convention-utils/`, plus `util/collectUnusedVariables.ts`, `util/isTypeImport.ts`, `util/isTypeOnlyReference.ts`, `util/referenceContainsTypePredicate.ts`, `util/referenceContainsTypeQuery.ts`, `util/misc.ts` (`getEnumNames`) and `type-utils/src/requiresQuoting.ts`.
Vendored version: `v8.71.1`. Upstream left the rule unchanged in `v8.71.2`, the installed `@typescript-eslint/*` version.

## Critical non-obvious constraints

- Parity with upstream is the contract for every option except where upstream needs the TypeScript program. The ported upstream specs (`rule.spec.ts`, `selector-*.spec.ts`) pin it; keep them passing rather than editing their cases.
- The local adaptations are exactly these, and `local-adaptations.spec.ts` covers them:
  - `types` is rejected when the options are read (`parse-options.ts`), with the reason; upstream would fail later, when linting, for lack of type information. `isCorrectType` in `validator.ts` therefore always returns true.
  - `requiresQuoting` (`requires-quoting.ts`) judges ECMAScript identifier syntax without TypeScript; upstream uses the program's compile target and ESNext without a program, which this matches.
  - Imports point at the flat files here instead of upstream's `util` index, which loads TypeScript.
- Nothing here may import `typescript` or `@typescript-eslint/type-utils`; `scripts/build.ts` fails if the `escapace` plugin can reach the bundled TypeScript.
- File names are kebab-case and the directory stays flat, as in `src/vendor/tsdoc`.

## Known landmines

- The directory is in `.lintignore`: the repository's autofixers once reordered upstream's `switch` cases. Formatting by oxfmt is fine (layout only); never let a lint fixer rewrite this code. Behaviour is pinned by the ported specs instead.
- The upstream specs were converted by removing the cases that use `types` and the typed-parser setup they needed; nothing else in them changed.

## Task routing

- When syncing with a newer typescript-eslint, copy the upstream files again, re-apply the three adaptations above, re-port the specs the same way, and update the version here.

## Maintenance note

Remove a line once code, tests or CI enforce it.
