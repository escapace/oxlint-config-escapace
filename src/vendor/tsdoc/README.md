# Vendored TSDoc ESLint plugin agent notes

## Purpose

This directory vendors `microsoft/tsdoc`'s ESLint plugin as maintained source inside `eslint-config-escapace`.

Upstream source: https://github.com/microsoft/tsdoc/tree/main/eslint-plugin  
Current vendored commit: `2dd8912e50b884653f674801dfbb044c897c3075`

## Critical non-obvious constraints

- Preserve user-facing rule semantics for `tsdoc/syntax`; local refactors should not change reported TSDoc message IDs, config lookup behavior, or parser configuration behavior.
- Keep production cache state contained in `config-cache.ts`; the singleton cache is intentional, but rule and helper modules should remain stateless.
- Keep this directory flat. Add sibling files such as `context.ts` or `context.spec.ts`; do not add nested test or helper directories.
- Use legal comments (`/*! ... */` or `//!`) for vendored Microsoft copyright/license headers so the bundle preserves them.

## Known landmines

- The `TSDoc` API names are aliased to `TSDocument...` only to satisfy repository abbreviation lint rules. Do not interpret that as a semantic distinction.
- `RuleTester.describe` and `RuleTester.it` are global test hooks. If a spec changes them, restore the previous values in cleanup.
- `meta.docs.category` is intentionally retained for upstream metadata compatibility even though modern ESLint types no longer model it.

## Task routing

- Put cache path resolution, expiration, and invalidation changes in `config-cache.ts` with deterministic tests.
- Put ESLint context compatibility in `context.ts`; keep fallback precedence compatible with upstream behavior.
- Put comment classification in `comments.ts`; keep rule reporting and parser orchestration in `rule.ts`.
- When syncing from upstream, update the vendored commit above and re-check local adaptations instead of reintroducing the standalone `eslint-plugin-tsdoc` package.

## Maintenance note

Prefer tests, types, lint rules, or local code comments over expanding this file. Keep only guidance that is easy to miss from the code and expensive to get wrong.
