# Development

This package's lint policy names no engine. Codegen decides which engine runs each rule from what the installed Oxlint can do. As Oxlint gains rules and languages, the package follows with data changes and a codegen run, not hand edits.

## How a rule reaches an engine

`pnpm run codegen` combines the policy in `src/configuration/` with Oxlint's capabilities and writes `src/generated/`. Each rule goes to the first match:

1. **Dropped as a parser check**, if Oxlint's parser already reports it (`src/capabilities/parser-level.ts`).
2. **Oxlint native**, for a language Oxlint lints, if Oxlint has the rule (after `src/capabilities/aliases.ts`) and `src/capabilities/exclusions.ts` doesn't exclude it.
3. **Oxlint JS plugin**, for a language Oxlint lints, if the rule's plugin has an `oxlint` entry in `src/capabilities/plugins.ts`.
4. **ESLint**, if the plugin has `residual: true` and the language is ESLint's or has `residual: true` in `src/configuration/languages.ts`. Both engines read such a language (Vue, Astro): Oxlint its scripts, ESLint the rest.
5. **Dropped** otherwise. An enabled rule must then be listed in `src/capabilities/dropped.ts` with a reason.

Codegen fails on a rule that doesn't exist, is deprecated, has options its schema rejects, or reaches both engines for the same files. `pnpm run build` checks the result with the real Oxlint binary. `pnpm test` runs `codegen --check` and needs a build first for its end-to-end tests.

Review every change by its `src/generated/` diff:

- `rule-index.ts`: each rule's engine and name there.
- `oxlint-configuration.ts`: the Oxlint config and the JS plugins it loads.
- `residual-configuration.ts` and `residual-groups/`: the ESLint config and each language's plugins.
- `rules/<language>.ts`: the composed rule tables.

## Change the policy

Edit `src/configuration/rules/<language>.ts`, `overrides.ts` or `rules/accessibility.ts`, then run codegen. Explain a rule turned off in a comment. A change to an upstream rule's settings needs no test; test only this package's own behaviour.

`rules/accessibility.ts` sets each accessibility rule once, by its name without a plugin. Codegen applies it to `jsx-a11y`, `astro/jsx-a11y` and `vue-a11y` wherever the plugin has the rule, and keeps each plugin's preset options.

## Add an ESLint plugin

1. Add it as a `devDependency`; plugins are bundled, never dependencies or peers. Add names other than `eslint-plugin-*` to `ignoreDependencies` in `.fallowrc.json`.
2. Describe it in `src/capabilities/plugins.ts`:
   - `namespace`: the rule prefix.
   - `package`: the npm package or the vendored path, which codegen imports for presets, rule names and option schemas.
   - `oxlint`: `{ shim }`, or `null` if it needs a parser Oxlint lacks. Set `alias` when Oxlint reserves the namespace, and `rules` to expose only some rules.
   - `residual`: whether ESLint may load it.
   - `unavailable`: rules the bundle can't run, with the reason.
3. If its prefix differs from the namespace (`@stylistic`, `yml`, `jsonc`), add it to `ruleKeyAliases` in `src/utilities/normalize-rules.ts`.
4. For Oxlint, add `src/engines/oxlint/plugins/<shim>.ts`, exporting the plugin through `unwrapPlugin` (see `regexp.ts`). For ESLint, add the namespace to the language's `eslint.plugins`.
5. Enable rules in `src/configuration/`, or compose a preset in `scripts/codegen/presets.ts`.
6. Run codegen, build and test.

Before enabling a plugin's rules in Oxlint, check them against the JS plugin API:

- There are no parser services: type-aware rules throw or do nothing. Mark them `unavailable`.
- Custom parsers aren't supported.
- Settings go in `src/configuration/settings.ts`; Oxlint accepts them only at the root.
- Oxlint loads every JS plugin on every run, so each plugin costs startup time.
- The API is outside Oxlint's semver.

## Fix a bundling failure

A plugin that reads files or resolves modules at runtime fails in the bundle. Add a transform to `scripts/rolldown-plugin-residual.ts`. Transforms fail the build when their pattern matches nothing, so an upstream change can't slip through; stubs and `resolveId` hooks don't, and `test/bundle.spec.ts` covers them.

| Problem                                    | Fix                                                                                                                                                                                                  |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The plugin requires `eslint` at load.      | Make the require optional; the Oxlint half must load without ESLint.                                                                                                                                 |
| The plugin requires `typescript`.          | Replace it with `undefined`, as for `regexp`. Only groups of languages with `eslint.typescript` may load the bundled TypeScript; the build checks this.                                              |
| The plugin reads its `package.json`.       | Inline the name and version (`packageMeta`).                                                                                                                                                         |
| A worker thread (`synckit`).               | Replace the call with one that throws, as for jsonc's `auto`. Mark the rules that can't work without it `unavailable`.                                                                               |
| One rule needs a large dependency.         | Mark the rule `unavailable`, turn it off, and stub the dependency, as for `lang` and `autocomplete-valid`.                                                                                           |
| A package with a binary per platform.      | Load it from the consumer's project with `requireFromProject`, as for Astro's compiler. Declare it as an optional peer with the range of the package that uses it; the build fails when they differ. |
| Only one rule of a large plugin is needed. | Import the rule file, with a `resolveId` case if `exports` blocks it (see `eslint-plugin-unicorn/rules/`).                                                                                           |

## Add a language both engines read

Vue and Astro are entries in `src/configuration/languages.ts` with `oxlint.kind: 'native'`, `residual: true` and an `eslint` provider: parser, plugins, `typescript` and `processor` as needed, and `oxlint.plugins` for a native Oxlint plugin. Svelte would be the next.

For a framework, set `detect` and add its id to `FrameworkLanguageId`; the type check then requires an option of that name. Detection, the option's errors, the Oxlint override with type-aware rules off, the ESLint processor and the disable-comment lanes follow from the entry. Then compose its table in `scripts/codegen/presets.ts`, remove its extension from `src/command/partition.ts` and add it to the README.

## Upgrade Oxlint

Update `oxlint` and `oxlint-tsgolint` together, and read their release notes: JS plugins and type-aware linting are outside Oxlint's semver. Ask the owner before widening their peer ranges. Release a raised peer floor as a feature and update the README's requirements. Under the fleet's Renovate policy, peer bumps are titled `chore`; retitle them.

1. Run codegen and read the diff. New native rules appear in `src/generated/capabilities/native-rules.json`, and rules that move change their `engine` or `engineId` in `rule-index.ts`.
2. New `correctness` and `suspicious` rules turn on by themselves. Lint this repository and a consumer, and turn unwanted ones off with a comment.
3. Fix what codegen reports, such as options a changed schema rejects.
4. An exclusion past its `until` version fails codegen. Test the native rule again, then remove the exclusion or renew it with a new reason.
5. A native plugin Oxlint added or dropped fails the type check in `src/capabilities/native-plugins.ts`. A new one reserves its name: give a JS plugin of that name an `alias`.

## Upgrade or remove an ESLint plugin

Codegen reports removed and deprecated rules and rejected options. Preset changes show in `src/generated/rules/`, option type changes in `src/generated/rule-options/`. Keep `typescript` within the range `@typescript-eslint/parser` supports. Sync `src/vendor/naming-convention/` and `src/vendor/tsdoc/` as their READMEs describe.

Codegen doesn't report unused plugins. A plugin is unused when neither engine's generated config loads it and no preset, shim or alias uses it. To remove it, delete its `plugins.ts` entry, shim, `languages.ts` and `ruleKeyAliases` references, transforms, `.fallowrc.json` entry and `devDependency`.

## Follow Oxlint's progress

**Rules.** The JS plugin rules can become native: `regexp`, `math`, `perfectionist`, `stylistic`, `de-morgan`, `baseline-js`, `depend` and `tsdoc`. A rule moves by itself when Oxlint ships it under the same name in an enabled plugin. If Oxlint names it differently, add an alias. If its plugin isn't enabled, add it to `BASE_NATIVE_PLUGINS` in `src/routing/route.ts`: Oxlint ignores rules of disabled plugins without an error. Enabling a plugin also turns on its `correctness` and `suspicious` rules, which the diff doesn't show.

**The `escapace` plugin** carries two upstream rules under a name Oxlint doesn't reserve:

- `escapace/naming-convention` is typescript-eslint's rule, vendored without TypeScript, until oxlint-tsgolint implements it ([tsgolint #186](https://github.com/oxc-project/tsgolint/issues/186)). Then rename the key to `typescript/naming-convention`, map `escapace/naming-convention` to it in `renamedRules` (removing the reverse entry), remove the rule from `createEscapacePlugin`, delete the vendored copy, and note in the release that disable comments need the new name.
- `escapace/name-replacements` is unicorn's rule with escapace's replacements, until Oxlint implements it with the same options. Then remove it the same way, mapping `unicorn/prevent-abbreviations` and `escapace/name-replacements` to Oxlint's id.

**Languages.** Oxlint plans language plugins: [discussion #21936](https://github.com/oxc-project/oxc/discussions/21936), [issue #23207](https://github.com/oxc-project/oxc/issues/23207), [pull request #24597](https://github.com/oxc-project/oxc/pull/24597), and for Vue templates [issue #15761](https://github.com/oxc-project/oxc/issues/15761). Codegen sets `features.languagePlugins` when Oxlint's schema declares `languagePlugins`. To move YAML, JSON or TOML:

1. Write a wrapper per language against Oxlint's contract, as a rolldown input. The `*-eslint-parser` packages already return the AST, tokens and comments it needs.
2. Give the rule plugin an `oxlint` shim and set `residual` on the language and the plugin.
3. Emit an Oxlint override per language in `src/routing/route.ts`, and `languagePlugins` in `src/engines/oxlint/configuration.ts` and `scripts/codegen/print-config.ts`.
4. Check token methods, non-ESTree ASTs and disable comments: those files then need `oxlint-` comments.
5. Last, set the language's `oxlint.kind` to `'language-plugin'`, which switches routing and `esclint`.

When ESLint has no language left, remove the ESLint half: `src/eslint.ts`, the `./eslint` export, `src/engines/eslint/configuration.ts`, `src/command/residual.ts`, the residual groups and the `eslint` peer. Keep `src/engines/eslint/unwrap.ts` and the `eslint` devDependency, which codegen uses.

**Type-aware rules** are off for Vue and Astro (`typeAware: false` in `languages.ts`) until oxlint-tsgolint is verified on them. Set it to `true` once a project passes, and update the README.

## Check Oxlint behaviour

Reproduce undocumented Oxlint behaviour with the installed binary in a scratch project outside this repository, since both engines look for config files in parent folders. Then record it as a test, so the next upgrade checks it. The package relies most on these:

- `extends` drops `settings`, `ignorePatterns`, `env`, `globals` and `categories`.
- Extglob patterns in `overrides.files` never match; use brace lists.
- Overrides reject `settings`; `options` is allowed only in the root config of a run.
- Oxlint ignores rules of native plugins missing from `plugins`, and refuses JS plugins named like native plugins.
- With `respectEslintDisableDirectives: false`, it ignores `eslint-disable` comments; `oxlint-disable` comments accept ESLint rule names.
- Its file walk honours `.gitignore` but doesn't skip `node_modules` without one.
- It parses every `oxlint.config.ts` it finds before applying that config's ignores.
