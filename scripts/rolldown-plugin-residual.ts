/*
 * The guarded transforms that make the bundled ESLint plugins self-contained
 * and keep the bundled TypeScript the only one. Every transform throws when
 * it matches nothing, so an upstream change breaks the build instead of
 * producing a broken bundle.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import type { Plugin } from 'rolldown'
import { isRecord } from '../src/utilities/is-record.ts'
import { readJson } from '../src/utilities/read-json.ts'

const require = createRequire(import.meta.url)

const packageMeta = (name: string): string => {
  const manifest = readJson(require.resolve(`${name}/package.json`))

  if (
    !isRecord(manifest) ||
    typeof manifest.name !== 'string' ||
    typeof manifest.version !== 'string'
  ) {
    throw new Error(`${name}/package.json has no name and version to inline`)
  }

  return JSON.stringify({ name: manifest.name, version: manifest.version })
}

const mustReplace = (
  code: string,
  pattern: string | RegExp,
  replacement: string,
  what: string,
): string => {
  const out = code.replace(pattern, replacement)

  if (out === code) {
    throw new Error(
      `rolldown-plugin-residual: ${what} matched nothing; the upstream package changed shape`,
    )
  }

  return out
}

const STUB = { code: 'module.exports = {}', map: null }

const projectModule = path.resolve(import.meta.dirname, '../src/engines/eslint/project-module.ts')

const dependencyRange = (manifestPath: string, field: string, name: string): unknown => {
  const manifest = readJson(manifestPath)

  return isRecord(manifest) && isRecord(manifest[field]) ? manifest[field][name] : undefined
}

/**
 * The compiler versions the bundled astro-eslint-parser accepts, which this
 * package's optional peer range must repeat: dependency updates widen peer
 * ranges on their own, past what the parser can use.
 */
const compilerRange = (): string => {
  const range = dependencyRange(
    require.resolve('astro-eslint-parser/package.json'),
    'dependencies',
    '@astrojs/compiler-rs',
  )
  const peer = dependencyRange(
    path.resolve(import.meta.dirname, '../package.json'),
    'peerDependencies',
    '@astrojs/compiler-rs',
  )

  if (typeof range !== 'string') {
    throw new TypeError('astro-eslint-parser no longer depends on @astrojs/compiler-rs')
  }

  if (peer !== range) {
    throw new Error(
      `the @astrojs/compiler-rs peer range (${String(peer)}) must be astro-eslint-parser's (${range})`,
    )
  }

  return range
}

// typescript-eslint's TSESLint wrappers (ESLint, Linter, RuleTester, SourceCode
// subclasses) and its core-rule lookup require `eslint` when loaded. Rules never
// use them, and the Oxlint half must load in projects without `eslint`, so the
// require is made optional: a missing engine yields classes that throw on use.
const OPTIONAL_ESLINT =
  /@typescript-eslint\/(?:eslint-plugin\/dist\/util\/getESLintCoreRule|utils\/dist\/ts-eslint\/(?:Linter|RuleTester|SourceCode|eslint\/(?:Flat|Legacy)ESLint))\.js$/
const MISSING_ESLINT =
  "const __escapaceMissing = (id) => new Proxy({}, { get: (_, key) => key === '__esModule' ? false : class { constructor() { throw new Error(`${id} is not installed in this project`) } } });\n"

export const residualPlugin = (): Plugin => ({
  name: 'oxlint-config-escapace-residual',
  load(id) {
    if (id === '\0css-tree-tokenizer') {
      const unicornDirectory = path.dirname(require.resolve('eslint-plugin-unicorn'))
      const cssTree = path.dirname(
        require.resolve('@eslint/css-tree/package.json', { paths: [unicornDirectory] }),
      )

      return `export { tokenize, tokenTypes } from '${path.join(cssTree, 'lib/tokenizer/index.js')}'; export { ident } from '${path.join(cssTree, 'lib/utils/index.js')}';`
    }

    if (id === '\0empty-globals') {
      return 'export default {}'
    }

    if (id.startsWith('\0stub:')) {
      return `export default function unavailable() { throw new Error("${id.slice(6)} is not bundled") }`
    }

    return null
  },
  resolveId(source, importer) {
    // unicorn's `name-replacements` is reached through the package's exports-less rules directory
    if (source.startsWith('eslint-plugin-unicorn/rules/')) {
      return require
        .resolve('eslint-plugin-unicorn')
        .replace(/index\.js$/, source.slice('eslint-plugin-unicorn/'.length))
    }

    // browserslist data is only read by rules this package never bundles
    if (source === 'browserslist' || source.startsWith('caniuse-lite')) {
      return `\0stub:${source}`
    }

    // jsx-a11y's `lang` needs the IANA language registry (1.35 MB) and `autocomplete-valid` needs
    // axe-core (1.4 MB); both rules are unavailable here
    if (source === 'language-tags' || source === 'axe-core') {
      return `\0stub:${source}`
    }

    // eslint-plugin-astro reads `globals` for its presets only, which flat config here never uses
    if (source === 'globals' && importer?.includes('eslint-plugin-astro') === true) {
      return '\0empty-globals'
    }

    // name-replacements needs css-tree's tokenizer only; the full entry drags mdn-data JSON through `require`
    if (source === '@eslint/css-tree') {
      return '\0css-tree-tokenizer'
    }

    return null
  },
  transform(code, id) {
    // Type tracing needs parser services, which Oxlint JS plugins never have; loading the
    // project's TypeScript there only costs time and memory and breaks isolation
    if (/eslint-type-tracer\/lib\/index\.(?:c?js|mjs)$/.test(id)) {
      return {
        code: mustReplace(
          code,
          /ts = [^;\n]*\("typescript"\);/,
          'ts = undefined;',
          `eslint-type-tracer typescript require in ${id}`,
        ),
        map: null,
      }
    }

    if (id.endsWith('eslint-plugin-regexp/dist/index.js')) {
      return {
        code: mustReplace(
          code,
          'cacheTypeScript ??= require("typescript")',
          'cacheTypeScript ??= undefined',
          'eslint-plugin-regexp typescript require',
        ),
        map: null,
      }
    }

    if (OPTIONAL_ESLINT.test(id)) {
      return {
        code:
          MISSING_ESLINT +
          mustReplace(
            code,
            /require\("(eslint(?:\/use-at-your-own-risk)?)"\)/g,
            '(() => { try { return require("$1") } catch { return __escapaceMissing("$1") } })()',
            `optional eslint require in ${id}`,
          ),
        map: null,
      }
    }

    // legacy eslintrc presets resolve the Vue parser at load; flat config never reads them
    if (/eslint-plugin-vue(?:js-accessibility)?\/dist\/configs\//.test(id)) {
      return STUB
    }

    // es-x presets resolve every rule file at load
    if (id.includes('eslint-plugin-es-x/dist/configs/')) {
      return STUB
    }

    // tsdoc-config locates the tsdoc.json schema through `resolve` at load; inline it
    if (id.endsWith('@microsoft/tsdoc-config/lib/TSDocConfigFile.js')) {
      const schema = JSON.stringify(
        JSON.parse(
          readFileSync(require.resolve('@microsoft/tsdoc/schemas/tsdoc.schema.json'), 'utf8'),
        ),
      )

      return {
        code: mustReplace(
          code,
          /const jsonSchemaPath = resolve\.sync\([\s\S]*?\);\s*const jsonSchemaContent = fs\.readFileSync\(jsonSchemaPath\)\.toString\(\);\s*const jsonSchema = jju\.parse\(jsonSchemaContent, \{ mode: 'cjson' \}\);/,
          `const jsonSchema = ${schema};`,
          'tsdoc-config schema lookup',
        ),
        map: null,
      }
    }

    if (id.endsWith('eslint-plugin-vue/dist/utils/index.js')) {
      return {
        code: mustReplace(
          code,
          'createRequire(require.resolve("eslint"))("eslint-scope")',
          'require("eslint-scope")',
          'eslint-plugin-vue eslint-scope lookup',
        ),
        map: null,
      }
    }

    if (id.endsWith('module-replacements/dist/esm/main.js')) {
      const imports: string[] = []
      const out = code.replaceAll(
        /JSON\.parse\(\s*(?:fs\.)?readFileSync\(\s*`\$\{manifestsDir\}\/([a-z-]+)\.json`\s*,\s*['"]utf-?8['"]\s*\)\s*\)/g,
        (_, name: string) => {
          const identifier = `__manifest_${name.replaceAll('-', '_')}`
          imports.push(
            `import ${identifier} from "../../manifests/${name}.json" with { type: "json" };`,
          )

          return identifier
        },
      )

      if (imports.length === 0) {
        throw new Error('rolldown-plugin-residual: module-replacements manifests matched nothing')
      }

      return { code: `${imports.join('\n')}\n${out}`, map: null }
    }

    if (id.endsWith('eslint-plugin-depend/lib/main.js')) {
      return {
        code: mustReplace(
          code,
          /JSON\.parse\(readFileSync\(path\.resolve\(__dirname,\s*['"]\.\.\/package\.json['"]\),\s*['"]utf-?8['"]\)\)/,
          packageMeta('eslint-plugin-depend'),
          'eslint-plugin-depend package metadata',
        ),
        map: null,
      }
    }

    if (id.endsWith('eslint-plugin-baseline-js/dist/index.mjs')) {
      // core-rule delegation reads ESLint's built-in rules; optional, so Oxlint-only projects load
      const withMeta = mustReplace(
        code,
        /createRequire\(import\.meta\.url\)\("\.\.\/package\.json"\)/,
        packageMeta('eslint-plugin-baseline-js'),
        'eslint-plugin-baseline-js package metadata',
      )
      const withOptionalImport = mustReplace(
        withMeta,
        'import { builtinRules } from "eslint/use-at-your-own-risk";',
        'import { createRequire as __escapaceCreateRequire } from "node:module"; const __escapaceBuiltinRules = () => { try { return __escapaceCreateRequire(import.meta.url)("eslint/use-at-your-own-risk").builtinRules } catch { return undefined } };',
        'eslint-plugin-baseline-js builtinRules import',
      )

      return {
        code: mustReplace(
          withOptionalImport,
          'core: (name) => builtinRules.get(name)',
          'core: (name) => __escapaceBuiltinRules()?.get(name)',
          'eslint-plugin-baseline-js core rule resolver',
        ),
        map: null,
      }
    }

    if (id.endsWith('eslint-plugin-jsx-a11y-x/lib/index.js')) {
      return {
        code: mustReplace(
          code,
          "require('../package.json')",
          packageMeta('eslint-plugin-jsx-a11y-x'),
          'eslint-plugin-jsx-a11y-x package metadata',
        ),
        map: null,
      }
    }

    if (id.endsWith('eslint-plugin-astro/lib/index.mjs')) {
      // the jsx-a11y rules it wraps come from the bundled jsx-a11y-x, not the project
      const withJsxA11y = mustReplace(
        code,
        /function requirePlugin\(pluginName\) \{\s*return requireUserLocal\(pluginName\);\s*\}/,
        'import __escapaceJsxA11y from "eslint-plugin-jsx-a11y-x"; function requirePlugin(pluginName) { return pluginName === "eslint-plugin-jsx-a11y-x" ? (__escapaceJsxA11y.default ?? __escapaceJsxA11y) : null; }',
        'eslint-plugin-astro jsx-a11y lookup',
      )
      // its presets load the project's TypeScript parser at load; flat config here never reads them
      const withoutParser = mustReplace(
        withJsxA11y,
        /function loadTypescriptEslintParser\(\) \{[^}]*\}/,
        'function loadTypescriptEslintParser() { return null; }',
        'eslint-plugin-astro TypeScript parser lookup',
      )

      return {
        // PostCSS configs load in a worker thread that cannot be bundled; no-unused-css-selector
        // then skips `<style lang="postcss">` blocks, as it does in projects without PostCSS
        code: mustReplace(
          withoutParser,
          /createSyncFn\(path\.join\(dirname, "postcss-worker\.mjs"\)\)/,
          '(() => { throw new Error("PostCSS is not available in the bundled residual") })',
          'eslint-plugin-astro PostCSS worker',
        ),
        map: null,
      }
    }

    if (id.endsWith('astro-eslint-parser/lib/index.mjs')) {
      const range = compilerRange()
      const withLoader = mustReplace(
        code,
        'import { parse } from "@astrojs/compiler-rs";',
        `import { requireFromProject as __escapaceRequireFromProject } from ${JSON.stringify(projectModule)}; const __escapaceCompiler = (file) => __escapaceRequireFromProject({ name: "@astrojs/compiler-rs", range: ${JSON.stringify(range)}, via: ["astro"] }, file);`,
        'astro-eslint-parser compiler import',
      )

      return {
        // the compiler is a binary per platform, so it comes from the project being linted
        code: mustReplace(
          withLoader,
          'const result = parse(code);',
          'const result = __escapaceCompiler(ctx.filePath).parse(code);',
          'astro-eslint-parser compiler call',
        ),
        map: null,
      }
    }

    if (/eslint-plugin-jsonc\/dist\/rules-[^/]+\.mjs$/.test(id)) {
      return {
        code: mustReplace(
          code,
          /createSyncFn\(fileURLToPath\(import\.meta\.resolve\([^)]*\)\)\)/,
          '(() => { throw new Error("jsonc/auto is not available in the bundled residual") })',
          'eslint-plugin-jsonc synckit worker',
        ),
        map: null,
      }
    }

    if (id.endsWith('@stylistic/eslint-plugin/dist/vendor.js')) {
      const modules: Record<string, string> = {
        '@eslint-community/eslint-utils': '__stylistic_eslint_utils',
        '@typescript-eslint/types': '__stylistic_typescript_types',
      }
      const imports: string[] = []
      let out = code

      for (const [specifier, identifier] of Object.entries(modules)) {
        if (!out.includes(`__require("${specifier}")`)) {
          continue
        }

        out = out.replaceAll(`__require("${specifier}")`, identifier)
        imports.push(`import * as ${identifier} from "${specifier}";`)
      }

      if (imports.length === 0) {
        throw new Error('rolldown-plugin-residual: @stylistic runtime requires matched nothing')
      }

      return { code: `${imports.join('\n')}\n${out}`, map: null }
    }

    return null
  },
})
