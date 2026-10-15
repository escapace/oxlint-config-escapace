/*
 * The languages this package lints, their file globs, and who can provide them.
 * `oxlint.kind` is the erosion gate: `native` today for JavaScript, TypeScript
 * and the scripts of Vue and Astro components; `language-plugin` once Oxlint ships
 * language plugins and this package carries a wrapper (see
 * docs/development.md); `unsupported` otherwise. A language Oxlint lints that
 * also has `residual` is read by both engines: Oxlint lints its scripts, ESLint
 * the rest (Vue and Astro templates). Nothing here names a rule.
 */
import type { NativePlugin } from '../capabilities/native-plugins.ts'
import type { FrameworkLanguageId, LanguageId } from './types.ts'

export interface EslintProvider {
  /** How the flat-config entry selects the parser: a Language API id or a parser module. */
  provider:
    | { kind: 'language'; language: string }
    | {
        kind: 'parser'
        parser: 'astro-eslint-parser' | 'jsonc-eslint-parser' | 'vue-eslint-parser'
      }
  /** Plugin namespaces (from `src/capabilities/plugins.ts`) registered for this language. */
  plugins: string[]
  /** The plugin module whose processor the entry runs (Vue's reads its template comments). */
  processor?: string
  /** Its scripts are parsed with `@typescript-eslint/parser`, so its group bundles TypeScript. */
  typescript?: boolean
}

export interface LanguageDefinition {
  files: string[]
  id: LanguageId
  oxlint: {
    kind: OxlintProviderKind
    /** Native plugins enabled for the language's files only. */
    plugins?: NativePlugin[]
    since?: string
    specifier?: string
  }
  /** The framework packages that turn the language on when the project depends on any of them. */
  detect?: { id: FrameworkLanguageId; packages: string[] }
  /** Oxlint `env` entries for the language's files, so `no-undef` knows their globals. */
  env?: Record<string, boolean>
  eslint?: EslintProvider
  /** May a rule of an Oxlint-native language that Oxlint cannot run fall back to ESLint? */
  residual: boolean
  /** Does the language take part in type-aware linting? */
  typeAware: boolean
}

export type OxlintProviderKind = 'language-plugin' | 'native' | 'unsupported'

export const languages: readonly LanguageDefinition[] = [
  {
    files: ['**/*.{ts,cts,mts,tsx}'],
    id: 'typescript',
    oxlint: { kind: 'native' },
    residual: false,
    typeAware: true,
  },
  {
    // JavaScript here is mostly config files and scripts run by Node; TypeScript files need no
    // env because `no-undef` is off there (TypeScript checks names itself)
    env: { node: true },
    files: ['**/*.{js,cjs,mjs,jsx}'],
    id: 'javascript',
    oxlint: { kind: 'native' },
    residual: false,
    typeAware: false,
  },
  {
    detect: { id: 'vue', packages: ['vue'] },
    eslint: {
      plugins: ['vue', 'vue-a11y'],
      processor: 'eslint-plugin-vue/dist/processor.js',
      provider: { kind: 'parser', parser: 'vue-eslint-parser' },
      typescript: true,
    },
    files: ['**/*.vue'],
    id: 'vue',
    oxlint: { kind: 'native', plugins: ['vue'] },
    residual: true,
    typeAware: false,
  },
  {
    // Oxlint lints the frontmatter and the client scripts, ESLint the template
    detect: { id: 'astro', packages: ['astro'] },
    eslint: {
      plugins: ['astro'],
      provider: { kind: 'parser', parser: 'astro-eslint-parser' },
      typescript: true,
    },
    files: ['**/*.astro'],
    id: 'astro',
    oxlint: { kind: 'native' },
    residual: true,
    typeAware: false,
  },
  {
    eslint: { plugins: ['yaml'], provider: { kind: 'language', language: 'yaml/yaml' } },
    files: ['**/*.{yml,yaml}'],
    id: 'yaml',
    oxlint: { kind: 'unsupported' },
    residual: true,
    typeAware: false,
  },
  {
    eslint: { plugins: ['json'], provider: { kind: 'parser', parser: 'jsonc-eslint-parser' } },
    files: ['**/*.json'],
    id: 'json',
    oxlint: { kind: 'unsupported' },
    residual: true,
    typeAware: false,
  },
  {
    eslint: { plugins: ['json'], provider: { kind: 'parser', parser: 'jsonc-eslint-parser' } },
    files: ['**/*.json5'],
    id: 'json5',
    oxlint: { kind: 'unsupported' },
    residual: true,
    typeAware: false,
  },
  {
    eslint: { plugins: ['json'], provider: { kind: 'parser', parser: 'jsonc-eslint-parser' } },
    // `.json` files whose readers accept comments, per each tool's own documentation
    files: [
      '**/*.jsonc',
      '**/tsconfig.{json,jsonc}',
      '**/tsconfig-*.{json,jsonc}',
      '**/tsconfig.*.{json,jsonc}',
      '**/api-extractor.{json,jsonc}',
      // VS Code reads these as JSON with comments (its configuration-editing and
      // typescript-basics extensions)
      '**/.vscode/{extensions,launch,mcp,settings,tasks}.json',
      '**/{.devcontainer,devcontainer}.json',
      '**/jsconfig.json',
      '**/jsconfig-*.json',
      '**/jsconfig.*.json',
      // Babel parses these as JSON5
      '**/{.babelrc,babel.config}.json',
      // ESLint 8, Oxlint, TypeDoc and markdownlint document comments in their JSON configs
      '**/{.eslintrc,.markdownlint,.oxlintrc,typedoc}.json',
    ],
    id: 'jsonc',
    oxlint: { kind: 'unsupported' },
    residual: true,
    typeAware: false,
  },
  {
    eslint: {
      plugins: ['json', 'depend'],
      provider: { kind: 'parser', parser: 'jsonc-eslint-parser' },
    },
    files: ['**/package.json'],
    id: 'package-json',
    oxlint: { kind: 'unsupported' },
    residual: true,
    typeAware: false,
  },
  {
    eslint: { plugins: ['toml'], provider: { kind: 'language', language: 'toml/toml' } },
    files: ['**/*.toml'],
    id: 'toml',
    oxlint: { kind: 'unsupported' },
    residual: true,
    typeAware: false,
  },
]

const expandBraces = (pattern: string): string[] => {
  const match = /\{([^{}]*)\}/.exec(pattern)

  if (match === null) {
    return [pattern]
  }

  const [whole, alternatives = ''] = match

  return alternatives
    .split(',')
    .flatMap((alternative) => expandBraces(pattern.replace(whole, alternative)))
}

/** File extensions (`.ts`, `.json`) a set of language globs can match, read off the globs themselves. */
export const extensionsOf = (globs: readonly string[]): Set<string> =>
  new Set(
    globs
      .flatMap((glob) => expandBraces(glob))
      .map((glob) => glob.slice(glob.lastIndexOf('/') + 1))
      .map((name) => (name.includes('.') ? name.slice(name.lastIndexOf('.')) : ''))
      .filter((extension) => extension !== '' && !extension.includes('*')),
  )

/** Whether Oxlint lints the language, natively or (once it ships them) through a language plugin. */
export const oxlintLintsLanguage = (
  language: LanguageDefinition,
  languagePlugins: boolean,
): boolean =>
  language.oxlint.kind === 'native' ||
  (language.oxlint.kind === 'language-plugin' && languagePlugins)

/** Whether both engines read the language's files: Oxlint its scripts, ESLint the rest. */
export const readByBothEngines = (language: LanguageDefinition): boolean =>
  language.oxlint.kind === 'native' && language.residual && language.eslint !== undefined

/** The languages both engines read, by file extension (`.vue`). */
export const sharedLanguageByExtension: ReadonlyMap<string, LanguageDefinition> = new Map(
  languages
    .filter((language) => readByBothEngines(language))
    .flatMap((language) =>
      [...extensionsOf(language.files)].map((extension) => [extension, language] as const),
    ),
)
