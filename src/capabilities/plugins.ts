/*
 * What this package knows about each ESLint plugin that cannot be generated:
 * whether it runs under Oxlint's JS plugin API, under which name, and whether
 * it can serve the ESLint residual. Keyed by canonical namespace.
 */
export interface PluginCapability {
  /** Canonical namespace used in rule ids (`regexp/prefer-w`). */
  namespace: string
  /** Oxlint side: `null` when the plugin needs a parser Oxlint lacks. */
  oxlint: {
    /** Name under which Oxlint loads it when the canonical one is reserved by a native plugin. */
    alias?: string
    /** Only these rules are exposed by the shim; absent means all. */
    rules?: string[]
    /** Shim module name under `src/engines/oxlint/plugins/` (also the `lib/node/plugins/<shim>.js` file). */
    shim: string
  } | null
  /** npm package (or local path for vendored code). */
  package: string
  /** ESLint side: may the plugin be loaded by the residual? */
  residual: boolean
  /** Rules the bundle cannot run, with the reason; left out of the rule index and rejected at config load. */
  unavailable?: Readonly<Record<string, string>>
}

/** Why `namespace/name` cannot run in this package, if it cannot. */
export const unavailableReason = (id: string): string | undefined => {
  const slash = id.indexOf('/')

  return slash === -1
    ? undefined
    : plugins.find((plugin) => plugin.namespace === id.slice(0, slash))?.unavailable?.[
        id.slice(slash + 1)
      ]
}

export const plugins: readonly PluginCapability[] = [
  {
    namespace: 'perfectionist',
    oxlint: { shim: 'perfectionist' },
    package: 'eslint-plugin-perfectionist',
    residual: false,
  },
  {
    namespace: 'regexp',
    oxlint: { shim: 'regexp' },
    package: 'eslint-plugin-regexp',
    residual: false,
  },
  { namespace: 'math', oxlint: { shim: 'math' }, package: 'eslint-plugin-math', residual: false },
  {
    namespace: 'de-morgan',
    oxlint: { shim: 'de-morgan' },
    package: 'eslint-plugin-de-morgan',
    residual: false,
  },
  {
    namespace: 'baseline-js',
    oxlint: { shim: 'baseline-js' },
    package: 'eslint-plugin-baseline-js',
    residual: false,
  },
  {
    namespace: 'stylistic',
    oxlint: { shim: 'stylistic' },
    package: '@stylistic/eslint-plugin',
    residual: false,
  },
  {
    namespace: 'depend',
    oxlint: { shim: 'depend' },
    package: 'eslint-plugin-depend',
    residual: true,
  },
  { namespace: 'tsdoc', oxlint: { shim: 'tsdoc' }, package: './src/vendor/tsdoc', residual: false },
  // the organisation's naming policy: typescript-eslint's naming-convention (vendored without
  // TypeScript) and unicorn's name-replacements, under one name Oxlint does not reserve
  {
    namespace: 'escapace',
    oxlint: { shim: 'escapace' },
    package: './src/engines/oxlint/escapace',
    residual: false,
  },
  // loaded for presets and rule existence only; their rules run natively or through `escapace`
  { namespace: 'unicorn', oxlint: null, package: 'eslint-plugin-unicorn', residual: false },
  {
    namespace: 'typescript',
    oxlint: null,
    package: '@typescript-eslint/eslint-plugin',
    residual: false,
  },
  // its jsx-a11y rules wrap eslint-plugin-jsx-a11y-x, which the bundle carries
  {
    namespace: 'astro',
    oxlint: null,
    package: 'eslint-plugin-astro',
    residual: true,
    unavailable: {
      'jsx-a11y/autocomplete-valid':
        'it runs axe-core, 1.4 MB the bundle leaves out; Oxlint runs jsx-a11y/autocomplete-valid on JSX',
      'jsx-a11y/lang':
        'it validates against the IANA language registry, 1.35 MB the bundle leaves out; Oxlint runs jsx-a11y/lang on JSX',
    },
  },
  { namespace: 'vue', oxlint: null, package: 'eslint-plugin-vue', residual: true },
  {
    namespace: 'vue-a11y',
    oxlint: null,
    package: 'eslint-plugin-vuejs-accessibility',
    residual: true,
  },
  { namespace: 'yaml', oxlint: null, package: 'eslint-plugin-yml', residual: true },
  {
    namespace: 'json',
    oxlint: null,
    package: 'eslint-plugin-jsonc',
    residual: true,
    unavailable: {
      auto: 'it computes the JavaScript config in a worker thread that cannot be bundled; JavaScript formatting comes from oxfmt here anyway',
    },
  },
  { namespace: 'toml', oxlint: null, package: 'eslint-plugin-toml', residual: true },
]

export const pluginByNamespace = (namespace: string): PluginCapability | undefined =>
  plugins.find((plugin) => plugin.namespace === namespace)
