# AGENTS.md

Guidance for agents working on this package: only what is non-obvious and expensive to get wrong.

## Critical constraints

- Engines are assigned by codegen, never by hand. Add a rule to `src/configuration/`, never to an engine-specific config or `src/generated/`. Change where it runs through `src/capabilities/`, `src/configuration/languages.ts` or the router, then run `pnpm run codegen` and review the `src/generated/` diff.
- Never add a runtime `dependency`, and never make `typescript` or an ESLint plugin a peer: plugin peers leak into every consumer. Never bundle `eslint` or `oxlint`; they are the consumer's optional peers, with `oxlint-tsgolint`.
- Never depend on or import `eslint-config-escapace`; copy from its source instead.

## Landmines

- `src/engines/oxlint/plugins/escapace.ts` deep-imports unicorn rule files that unicorn's `exports` map blocks; only the `resolveId` hook in `scripts/rolldown-plugin-residual.ts` resolves them. Never import the shims from codegen or unit tests; `pnpm run build` validates them with the real binary.
- A "transform matched nothing" build failure means an upstream package changed shape: read its new code and update the transform; never loosen or delete the guard.
- Extglob patterns such as `?([cm])ts` in Oxlint `overrides.files` match nothing, silently; use brace lists.
- Oxlint ignores, without an error, rules of native plugins that the config doesn't enable (`BASE_NATIVE_PLUGINS` in `src/routing/route.ts`, `nativePlugins` in `src/configuration/overrides.ts`).
- Oxlint parses every `oxlint.config.ts` it meets while walking, before that config's ignore patterns apply, and both engines look for config files in parent folders. Test fixtures with their own config files must sit under an ignored folder, and tests must run them from a copy outside the repository, as `test/esclint.spec.ts` does.
- The ESLint config must stay `eslint.config.mjs`: ESLint needs `jiti` or an unstable flag for `.ts`, and the editor extension provides neither.

## Ask before doing

- Anything under `/home/mark/devel/monorepo` (normalization CLI, policy model, templates): only with the owner's approval, after everything else is finished. The task list is `docs/monorepo-rollout.md`, which stays out of Git.
- Widening the `oxlint` or `oxlint-tsgolint` peer range, or adding automerge for them: JS plugins and type-aware mode are outside Oxlint's semver.

## Task routing

- Adding or removing a plugin, upgrading Oxlint or a plugin, and Oxlint language plugins: follow `docs/development.md`.
- A new fact about Oxlint: reproduce it with the installed binary outside the repository and record it as a test.
- The vendored code in `src/vendor/tsdoc/` and `src/vendor/naming-convention/` has its own agent notes in each README; follow them.

## Maintenance note

Remove a line once code, tests, codegen or CI enforce it.
