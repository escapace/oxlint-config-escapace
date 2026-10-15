# oxlint-config-escapace

The shared lint configuration for escapace projects. [Oxlint](https://oxc.rs/docs/guide/usage/linter) lints JavaScript, TypeScript and the scripts of Vue and Astro components. ESLint lints what Oxlint can't parse yet: YAML, JSON, TOML, and Vue and Astro templates. The `esclint` command runs both.

## Requirements

- Node.js 22.18 or later.
- Oxlint 1.87 or later, oxlint-tsgolint 7 and ESLint 10.
- For type-aware rules, a `tsconfig.json` that TypeScript 7 accepts.
- For Astro, Astro 7.3 or later, which installs the compiler ESLint parses templates with. With an older Astro, add `@astrojs/compiler-rs` 0.4 or 0.5.

## Set up

Install the package and the engines:

```sh
pnpm add -D oxlint-config-escapace oxlint oxlint-tsgolint eslint
```

A project without JavaScript, TypeScript, Vue or Astro files, such as an Ansible role, needs only `oxlint-config-escapace` and `eslint`. With `typeAware: false`, leave out `oxlint-tsgolint`. The ESLint plugins and TypeScript are bundled.

Create a config file for each engine at the root of the repository:

```ts
// oxlint.config.ts
import { escapace } from 'oxlint-config-escapace'

export default escapace()
```

```js
// eslint.config.mjs
import { escapace } from 'oxlint-config-escapace/eslint'

export default escapace()
```

Export `escapace()` directly: Oxlint's `extends` drops its ignore patterns, settings and globals. Delete any `.oxlintrc.json` from an earlier setup.

Add the scripts to `package.json`:

```json
{ "scripts": { "lint": "esclint", "format": "esclint --fix" } }
```

## Run

```sh
esclint                   # lint the project
esclint --fix             # apply both engines' fixes
esclint src a.yaml        # lint files and folders (no globs)
esclint --format github   # annotate a GitHub Actions run
```

`esclint` runs each engine whose config file it finds in the working directory or above, and exits with 1 when either reports an error. A path that matches no file isn't an error, so pre-commit hooks can pass staged files.

It takes Oxlint's flags. These apply to ESLint too: `--fix`, `--quiet`, `--max-warnings`, `--deny-warnings`, `-A`/`-W`/`-D`, `--ignore-pattern`, `--ignore-path`, `--no-ignore` and `--format` (`stylish`, `json`, `github`, `unix`).

`esclint --print-config [file]` prints both engines' configurations.

## Configure

Pass options to `escapace()`. The ESLint config accepts `rules`, `overrides`, `ignorePatterns`, `vue` and `astro`.

```ts
export default escapace({
  rules: { 'typescript/no-explicit-any': 'warn' },
  overrides: [{ files: ['scripts/**'], rules: { 'eslint/no-console': 'off' } }],
  ignorePatterns: ['generated/'],
  vitest: { rules: { 'vitest/no-conditional-expect': 'off' } },
})
```

| Option             | Effect                                                                     |
| ------------------ | -------------------------------------------------------------------------- |
| `rules`            | Rule settings for all files.                                               |
| `overrides`        | `rules`, `env` and `globals` for `files`, except `excludeFiles`.           |
| `ignorePatterns`   | More files to ignore, in `.gitignore` syntax.                              |
| `typeAware`        | `false` turns type-aware rules off. Default: `true`.                       |
| `typeAwareExclude` | Files without type-aware rules.                                            |
| `javascript`       | `files` and `rules` for JavaScript files.                                  |
| `vitest`           | `files` and `rules` for test files (`*.test.*`, `*.spec.*`, `__tests__/`). |
| `vue`, `astro`     | `files`, `rules` and `enabled` for Vue or Astro files.                     |
| `env`, `globals`   | Oxlint's options of the same names.                                        |

A `files` option replaces the default files.

**Rules.** Name rules as Oxlint does, such as `typescript/no-unused-vars`; ESLint names such as `@typescript-eslint/no-unused-vars` work too. Set each rule in the config file of the engine that runs it, `vitest/*` rules in `vitest.rules` and `vue/*` rules in `vue.rules`. To use an Oxlint plugin this package leaves off, such as `react`, set its rules in an `overrides` entry. A misplaced or unknown rule makes the config fail with a message that says where it belongs.

Two rules replace their ESLint counterparts: `escapace/naming-convention` replaces `@typescript-eslint/naming-convention` (without the `types` option), and `escapace/name-replacements` replaces `unicorn/prevent-abbreviations`. Disable comments need the new names.

**Ignored files.** Besides build output, dependencies and generated files, `esclint` skips what `.gitignore`, `.lintignore` and `ignorePatterns` list, even when you name the file.

**Vue and Astro.** Support turns on when the project depends on `vue` or `astro`. Set `enabled` to override this. Name a Vue root component `application.vue`, not `App.vue`.

**Accessibility.** Vue, Astro, JSX and TSX get the same accessibility rules, each under its plugin's names: `vue-a11y/*`, `astro/jsx-a11y/*` and `jsx-a11y/*`. To turn a rule off everywhere, set it under each name.

**Type-aware rules.** They don't run on JavaScript, Vue or Astro files. If TypeScript 7 rejects a `tsconfig.json`, fix it or set `typeAware: false`.

## Monorepos

A project has one `oxlint.config.ts`, at its root:

- Configure packages with `overrides` entries, such as `files: ['packages/app/**']`.
- List package ignores in the root `.lintignore`, prefixed with the package folder.
- Build the workspace packages before you lint, or type-aware rules see imports between them as `any`.

A package may have its own `eslint.config.mjs`. A separate project in the repository, such as test fixtures, may have its own config files when the enclosing project ignores its folder; lint it from that folder.

## Disable comments

Each engine reads only its own comments:

| Files                                                                    | Comments          |
| ------------------------------------------------------------------------ | ----------------- |
| JavaScript, TypeScript, Vue `<script>`, Astro frontmatter and `<script>` | `oxlint-disable…` |
| YAML, JSON, TOML, Vue and Astro templates                                | `eslint-disable…` |

```ts
// oxlint-disable-next-line typescript/no-explicit-any -- the API returns untyped JSON
const data: any = await response.json()
```

`esclint --fix` converts `eslint-disable` comments for Oxlint's rules to the `oxlint-` form. Run `esclint` again afterwards: the run that converts the comments still reports what they disable.

Both engines read Vue and Astro scripts. There, a comment without rule names disables only ESLint's rules, and one that names rules of both engines must be split by hand, as the report explains:

```vue
<script setup lang="ts">
// eslint-disable-next-line vue/no-unused-properties
const same = items.length == 2 // oxlint-disable-line eqeqeq
</script>
```

## License

[MPL-2.0](./LICENSE)
