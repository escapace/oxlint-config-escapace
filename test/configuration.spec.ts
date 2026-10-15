import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Linter } from 'eslint'
import { afterAll, describe, expect, it } from 'vitest'
import { createEslintConfiguration } from '../src/engines/eslint/configuration.ts'
import { createOxlintConfiguration } from '../src/engines/oxlint/configuration.ts'
import { languages } from '../src/configuration/languages.ts'
import {
  collectIgnorePatterns,
  ConfigurationError,
  detectLanguage,
  inheritedIgnorePatterns,
  reachingConfiguration,
} from '../src/engines/shared.ts'
import { oxlintConfiguration } from '../src/generated/oxlint-configuration.ts'
import { ruleIndex } from '../src/generated/rule-index.ts'

// every temporary folder of this file lives here and goes when the file is done
const scratch = mkdtempSync(path.join(tmpdir(), 'esclint-configuration-spec-'))

afterAll(() => {
  rmSync(scratch, { force: true, recursive: true })
})

const project = (files: Record<string, string> = {}): string => {
  const directory = mkdtempSync(path.join(scratch, 'oxlint-config-escapace-'))

  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(directory, name), content)
  }

  return directory
}

const findLanguage = (configs: Linter.Config[], glob: string): Linter.Config | undefined =>
  configs.find((config) => Array.isArray(config.files) && config.files.includes(glob))

const offRules = (rules: Partial<Record<string, unknown>> | undefined): string[] =>
  Object.entries(rules ?? {})
    .filter(([, entry]) => entry === 'off')
    .map(([id]) => id)

describe('createOxlintConfiguration', () => {
  it('points every JS plugin at a module that exists', () => {
    const configuration = createOxlintConfiguration({}, { cwd: project() })

    expect(configuration.jsPlugins?.length).toBe(oxlintConfiguration.jsPlugins.length)

    for (const plugin of configuration.jsPlugins ?? []) {
      const specifier = typeof plugin === 'string' ? plugin : plugin.specifier
      expect(path.isAbsolute(specifier)).toBe(true)
      expect(existsSync(specifier), specifier).toBe(true)
    }
  })

  it('keeps Oxlint type-aware flag standard and derives typeAwareExclude as an override', () => {
    const cwd = project()
    expect(createOxlintConfiguration({}, { cwd }).options?.typeAware).toBe(true)
    expect(createOxlintConfiguration({ typeAware: false }, { cwd }).options?.typeAware).toBe(false)

    const excluded = createOxlintConfiguration({ typeAwareExclude: ['legacy/**'] }, { cwd })
    const override = excluded.overrides?.find((candidate) => candidate.files.includes('legacy/**'))
    expect(offRules(override?.rules)).toEqual(oxlintConfiguration.typeAwareRules)
  })

  it('folds ignore files into ignorePatterns', () => {
    const cwd = project({ '.lintignore': '# comment\nbuild\n!build/keep.ts\n' })
    const configuration = createOxlintConfiguration({}, { cwd })
    expect(configuration.ignorePatterns).toContain('build')
    expect(configuration.ignorePatterns).toContain('!build/keep.ts')
    expect(configuration.ignorePatterns).toContain('**/node_modules/')
  })

  it('enables the Vue fragment from package.json or the option', () => {
    const plain = createOxlintConfiguration({}, { cwd: project() })
    expect(plain.overrides?.some((override) => override.files.includes('**/*.vue'))).toBe(false)

    const withVue = createOxlintConfiguration(
      {},
      { cwd: project({ 'package.json': JSON.stringify({ dependencies: { vue: '3.5.0' } }) }) },
    )
    expect(withVue.overrides?.some((override) => override.files.includes('**/*.vue'))).toBe(true)

    const forced = createOxlintConfiguration({ vue: { enabled: true } }, { cwd: project() })
    expect(forced.overrides?.some((override) => override.files.includes('**/*.vue'))).toBe(true)
  })

  it('accepts consumer rules in every spelling and routes them by the generated index', () => {
    const configuration = createOxlintConfiguration(
      {
        rules: { '@typescript-eslint/no-explicit-any': 'off', 'unicorn/name-replacements': 'off' },
      },
      { cwd: project() },
    )
    expect(configuration.rules?.['typescript/no-explicit-any']).toBe('off')
    expect(configuration.rules?.['escapace/name-replacements']).toBe('off')
  })

  it('rejects unknown rules with a suggestion and wrong-engine rules with the file to use', () => {
    const cwd = project()
    expect(() =>
      createOxlintConfiguration({ rules: { 'typescript/no-explicit-anyy': 'off' } }, { cwd }),
    ).toThrow(/Did you mean "typescript\/no-explicit-any"/)
    expect(() =>
      createOxlintConfiguration({ rules: { 'yaml/sort-keys': 'off' } }, { cwd }),
    ).toThrow(ConfigurationError)
    expect(() =>
      createOxlintConfiguration({ rules: { 'yaml/sort-keys': 'off' } }, { cwd }),
    ).toThrow(/eslint\.config\.mjs/)
  })
})

/** The Oxlint config for `options` in a fresh project. */
const oxlint = (options: Parameters<typeof createOxlintConfiguration>[0]) =>
  createOxlintConfiguration(options, { cwd: project() })

describe('consumer rules', () => {
  it('keeps the severity the consumer wrote, perfectionist included', () => {
    const configuration = createOxlintConfiguration(
      { rules: { 'perfectionist/sort-objects': 'error' } },
      { cwd: project() },
    )
    const entry = configuration.rules?.['perfectionist/sort-objects']
    expect(Array.isArray(entry) ? entry[0] : entry).toBe('error')
  })

  it('rejects rules of plugins this package does not provide', () => {
    expect(() =>
      createOxlintConfiguration({ rules: { '@babel/semi': 'error' } }, { cwd: project() }),
    ).toThrow(/does not provide/)
  })

  it('rejects root rules whose Oxlint plugin is not enabled there, and enables it in overrides', () => {
    const cwd = project()
    expect(() =>
      createOxlintConfiguration({ rules: { 'vitest/no-focused-tests': 'error' } }, { cwd }),
    ).toThrow(/vitest\.rules/)
    expect(() =>
      createOxlintConfiguration({ rules: { 'react/jsx-key': 'error' } }, { cwd }),
    ).toThrow(/set it in an override/)

    const configuration = createOxlintConfiguration(
      { overrides: [{ files: ['web/**'], rules: { 'react/jsx-key': 'error' } }] },
      { cwd },
    )
    const override = configuration.overrides?.find((candidate) =>
      candidate.files.includes('web/**'),
    )
    expect(override?.plugins).toContain('react')
  })

  it('lets root rules win inside generated groups, except type-aware rules turned off there', () => {
    const configuration = createOxlintConfiguration(
      { rules: { 'typescript/no-floating-promises': 'warn' } },
      { cwd: project() },
    )
    const javascript = configuration.overrides?.find((override) =>
      override.files.includes('**/*.{js,cjs,mjs,jsx}'),
    )
    expect(javascript?.rules?.['typescript/no-floating-promises']).toBe('off')
  })

  it("keeps the package's options when the consumer gives only a severity, as ESLint does", () => {
    const packaged = { args: 'none', caughtErrors: 'none' }

    const severity = oxlint({ rules: { 'typescript/no-unused-vars': 'warn' } })
    expect(severity.rules?.['eslint/no-unused-vars']).toMatchObject(['warn', packaged])

    const replaced = oxlint({ rules: { 'typescript/no-unused-vars': ['warn', { args: 'all' }] } })
    expect(replaced.rules?.['eslint/no-unused-vars']).toEqual(['warn', { args: 'all' }])
    expect(
      oxlint({ rules: { 'typescript/no-unused-vars': 'off' } }).rules?.['eslint/no-unused-vars'],
    ).toBe('off')

    const override = oxlint({
      overrides: [{ files: ['scripts/**'], rules: { 'typescript/no-unused-vars': 'warn' } }],
    }).overrides?.find((candidate) => candidate.files.includes('scripts/**'))
    expect(override?.rules?.['eslint/no-unused-vars']).toMatchObject(['warn', packaged])
  })

  it('passes the perfectionist settings and reports unused disable directives', () => {
    const configuration = createOxlintConfiguration({}, { cwd: project() })
    expect(configuration.settings).toHaveProperty('perfectionist')
    expect(configuration.options).toMatchObject({ reportUnusedDisableDirectives: 'warn' })
  })
})

describe('createEslintConfiguration', () => {
  it('splits a consumer override per language that registers its plugins', () => {
    const configs = createEslintConfiguration(
      { overrides: [{ files: ['deploy/**'], rules: { 'yaml/quotes': 'off' } }] },
      { cwd: project() },
    )
    const entries = configs.filter(
      (config) => config.name?.startsWith('escapace/overrides/') === true,
    )
    expect(entries.map((entry) => entry.name)).toEqual(['escapace/overrides/0/yaml'])
    expect(entries[0]?.files).toEqual([['deploy/**', '**/*.{yml,yaml}']])
  })

  it('applies consumer rules after the generated file groups', () => {
    const configs = createEslintConfiguration(
      { rules: { 'yaml/sort-keys': 'off' } },
      { cwd: project() },
    )
    const consumer = configs.findIndex((config) => config.name === 'escapace/rules/yaml')
    const workflows = configs.findIndex((config) => config.name === 'escapace/github-workflows')
    expect(consumer).toBeGreaterThan(-1)
    expect(consumer).toBeGreaterThan(workflows)
  })

  it('starts with ignores, never parses Oxlint-only files, and reads ignore files as gitignore', () => {
    const configs = createEslintConfiguration({}, { cwd: project({ '.lintignore': '/build\n' }) })
    expect(configs[0]?.ignores).toContain('**/*.{ts,cts,mts,tsx}')
    expect(configs[0]?.ignores).toContain('**/*.{js,cjs,mjs,jsx}')
    const lintignore = configs.find((config) => config.name === 'escapace/.lintignore')
    expect(lintignore?.ignores).toEqual(['build'])
  })

  it('configures each residual language lazily', () => {
    const configs = createEslintConfiguration({}, { cwd: project() })

    const yaml = findLanguage(configs, '**/*.{yml,yaml}')
    expect(yaml?.language).toBe('yaml/yaml')
    expect(yaml?.rules?.['yaml/sort-keys']).toBeDefined()

    const plugins = yaml?.plugins ?? {}
    expect(Object.keys(plugins)).toEqual(['yaml'])
    expect(plugins.yaml?.rules?.['sort-keys']).toBeDefined()
  })

  it('shares one plugin object per namespace across entries', () => {
    const configs = createEslintConfiguration({}, { cwd: project() })
    const entries = configs.filter(
      (config) => config.plugins !== undefined && 'json' in config.plugins,
    )
    expect(entries.length).toBeGreaterThan(1)
    const [first, ...rest] = entries
    for (const entry of rest) {
      expect(entry.plugins?.json).toBe(first?.plugins?.json)
    }
  })

  it('adds the Vue entry only when Vue is enabled', () => {
    expect(
      findLanguage(createEslintConfiguration({}, { cwd: project() }), '**/*.vue'),
    ).toBeUndefined()
    const vue = findLanguage(
      createEslintConfiguration({ vue: { enabled: true } }, { cwd: project() }),
      '**/*.vue',
    )
    expect(vue?.processor).toBeDefined()
    expect(vue?.rules?.['vue/require-v-for-key']).toBeDefined()
  })

  it('accepts a rule both engines serve, in either file', () => {
    const cwd = project()
    expect(
      createOxlintConfiguration({ rules: { 'depend/ban-dependencies': 'off' } }, { cwd }).rules?.[
        'depend/ban-dependencies'
      ],
    ).toBe('off')
    expect(() =>
      createEslintConfiguration({ rules: { 'depend/ban-dependencies': 'off' } }, { cwd }),
    ).not.toThrow()
  })

  it('rejects Oxlint rules in the residual file with the file to use', () => {
    expect(() =>
      createEslintConfiguration(
        { rules: { 'typescript/no-explicit-any': 'off' } },
        { cwd: project() },
      ),
    ).toThrow(/oxlint\.config\.ts/)
  })
})

describe('second review', () => {
  it('passes env and globals of consumer overrides to Oxlint', () => {
    const configuration = createOxlintConfiguration(
      { overrides: [{ env: { browser: true }, files: ['web/**'], globals: { APP: 'readonly' } }] },
      { cwd: project() },
    )
    const override = configuration.overrides?.find((candidate) =>
      candidate.files.includes('web/**'),
    )
    expect(override?.env).toEqual({ browser: true })
    expect(override?.globals).toEqual({ APP: 'readonly' })
  })

  it('accepts the hyphenated jsx-a11y and react-perf spellings', () => {
    const configuration = createOxlintConfiguration(
      {
        overrides: [
          {
            files: ['web/**'],
            rules: { 'jsx-a11y/alt-text': 'warn', 'react-perf/jsx-no-new-object-as-prop': 'error' },
          },
        ],
      },
      { cwd: project() },
    )
    const override = configuration.overrides?.find((candidate) =>
      candidate.files.includes('web/**'),
    )
    expect(override?.rules).toHaveProperty('jsx_a11y/alt-text', 'warn')
    expect(override?.rules).toHaveProperty('react_perf/jsx-no-new-object-as-prop', 'error')
    expect(override?.plugins).toContain('react-perf')
  })

  it('rejects residual Vue rules when Vue is off', () => {
    expect(() =>
      createEslintConfiguration({ rules: { 'vue/html-indent': 'error' } }, { cwd: project() }),
    ).toThrow(/Vue support is off/)
  })
})

describe('third review', () => {
  it('skips unreadable directories and never walks into ignored ones', () => {
    const cwd = project({ '.gitignore': 'vendor/\n' })
    mkdirSync(path.join(cwd, 'locked'))
    mkdirSync(path.join(cwd, 'vendor/pkg'), { recursive: true })
    writeFileSync(path.join(cwd, 'vendor/pkg/.gitignore'), 'x\n')
    mkdirSync(path.join(cwd, 'app/[slug]'), { recursive: true })
    writeFileSync(path.join(cwd, 'app/[slug]/.gitignore'), 'gen.yaml\n')
    chmodSync(path.join(cwd, 'locked'), 0o000)

    try {
      const configs = createEslintConfiguration({}, { cwd })
      const names = configs.map((config) => config.name)
      expect(names).not.toContain('escapace/vendor/pkg/.gitignore')
      const slug = configs.find((config) => config.name === 'escapace/app/[slug]/.gitignore')
      expect(slug?.ignores).toEqual([String.raw`app/\[slug\]/**/gen.yaml`])
    } finally {
      chmodSync(path.join(cwd, 'locked'), 0o755)
    }
  })

  it('rejects Vue rules in residual overrides when Vue is off', () => {
    expect(() =>
      createEslintConfiguration(
        { overrides: [{ files: ['**/*.vue'], rules: { 'vue/html-indent': 'error' } }] },
        { cwd: project() },
      ),
    ).toThrow(/Vue support is off/)
  })
})

describe('pilot', () => {
  it('keeps no-underscore-dangle off, since name-replacements asks for trailing underscores', () => {
    expect(
      createOxlintConfiguration({}, { cwd: project() }).rules?.['eslint/no-underscore-dangle'],
    ).toBe('off')
  })

  it('lets declaration files keep the export {} that declare global needs', () => {
    const declarations = createOxlintConfiguration({}, { cwd: project() }).overrides?.find(
      (override) => override.files.includes('**/*.d.{ts,cts,mts}'),
    )
    expect(declarations?.rules).toMatchObject({ 'unicorn/require-module-specifiers': 'off' })
  })
})

describe('disable comment lanes', () => {
  it('reads only oxlint-disable comments and reports unused ones, in Vue projects too', () => {
    const lanes = { reportUnusedDisableDirectives: 'warn', respectEslintDisableDirectives: false }
    expect(createOxlintConfiguration({}, { cwd: project() }).options).toMatchObject(lanes)
    expect(
      createOxlintConfiguration({ vue: { enabled: true } }, { cwd: project() }).options,
    ).toMatchObject(lanes)

    const installed = project({ 'package.json': JSON.stringify({ name: 'root' }) })
    mkdirSync(path.join(installed, 'node_modules/.pnpm/vue@3.5.0'), { recursive: true })
    expect(createOxlintConfiguration({}, { cwd: installed }).options).toMatchObject(lanes)
  })
})

/** A project with `files` and an empty `folder` inside it. */
const nested = (files: Record<string, string>, folder: string): [string, string] => {
  const root = project(files)
  mkdirSync(path.join(root, folder), { recursive: true })

  return [root, path.join(root, folder)]
}

const vueLanguage = languages.find((language) => language.id === 'vue') ?? languages[0]

/** Vue detection for a project root with `files`, and a store folder when given. */
const hasVue = (files: Record<string, string>, store?: string) => {
  const cwd = project({ 'package.json': JSON.stringify({ name: 'root' }), ...files })

  if (store !== undefined) {
    mkdirSync(path.join(cwd, store), { recursive: true })
  }

  return detectLanguage(cwd, vueLanguage, undefined)
}

/** A checkout with a config, a linked worktree and a submodule recorded as Git records them. */
const checkout = (): string => {
  const root = project({
    '.gitmodules': '[submodule "lib"]\n\tpath = vendor/lib\n',
    'oxlint.config.ts': '',
  })
  const worktree = path.join(root, '.claude/worktrees/feat')
  mkdirSync(path.join(root, '.git/worktrees/feat'), { recursive: true })
  mkdirSync(worktree, { recursive: true })
  writeFileSync(path.join(root, '.git/worktrees/feat/gitdir'), `${path.join(worktree, '.git')}\n`)
  writeFileSync(path.join(worktree, '.git'), `gitdir: ${path.join(root, '.git/worktrees/feat')}\n`)
  writeFileSync(path.join(worktree, 'oxlint.config.ts'), '')

  return root
}

describe('nested checkouts and inherited ignores', () => {
  it('makes a worktree or submodule inside the checkout a project of its own', () => {
    const root = checkout()
    expect(collectIgnorePatterns(root)).toEqual(
      expect.arrayContaining(['/.claude/worktrees/feat/', '/vendor/lib/']),
    )
    expect(
      reachingConfiguration('oxlint', path.join(root, '.claude/worktrees/feat')),
    ).toBeUndefined()
    expect(() =>
      createOxlintConfiguration({}, { cwd: path.join(root, '.claude/worktrees/feat') }),
    ).not.toThrow()
  })

  it("gives a package's ESLint config the ignore files of the project above it", () => {
    const root = project({
      '.gitignore': '*.local.yaml\npackages/app/generated/\npackages/other/\n!keep.local.yaml\n',
      '.lintignore': 'packages/app/fixtures/\n',
    })
    mkdirSync(path.join(root, '.git'))
    mkdirSync(path.join(root, 'packages/app'), { recursive: true })
    mkdirSync(path.join(root, 'separate'))
    writeFileSync(path.join(root, '.lintignore'), 'packages/app/fixtures/\nseparate/\n')

    // `.lintignore` first, then `.gitignore`; `separate/` holds at any depth, so in the package too
    expect(inheritedIgnorePatterns(path.join(root, 'packages/app'))).toEqual([
      '/fixtures/',
      'separate/',
      '*.local.yaml',
      '/generated/',
      '!keep.local.yaml',
    ])
    expect(inheritedIgnorePatterns(path.join(root, 'separate'))).toEqual([])
    expect(inheritedIgnorePatterns(root)).toEqual([])
  })
})

describe('one config per project', () => {
  it('finds the config above whose project includes a folder, .oxlintrc.json included', () => {
    const [root, folder] = nested({ '.oxlintrc.json': '{}\n' }, 'packages/app')
    expect(reachingConfiguration('oxlint', folder)).toBe(path.join(root, '.oxlintrc.json'))
    expect(reachingConfiguration('oxlint', root)).toBeUndefined()
    expect(reachingConfiguration('eslint', folder)).toBeUndefined()
  })

  it('treats a folder the config above ignores as a project of its own', () => {
    const [, ignored] = nested(
      { '.lintignore': 'repositories/**\n', 'oxlint.config.ts': '' },
      'repositories/x',
    )
    expect(reachingConfiguration('oxlint', ignored)).toBeUndefined()

    const [root, below] = nested({ 'oxlint.config.ts': '' }, 'vendor/tool')
    writeFileSync(path.join(root, 'vendor/.gitignore'), 'tool/\n')
    expect(reachingConfiguration('oxlint', below)).toBeUndefined()

    const [, installed] = nested({ 'oxlint.config.ts': '' }, 'node_modules/package')
    expect(reachingConfiguration('oxlint', installed)).toBeUndefined()

    // `vendor/**` leaves nothing in vendor to lint, so vendor itself is a project of its own
    const [, contents] = nested({ '.lintignore': 'vendor/**\n', 'oxlint.config.ts': '' }, 'vendor')
    expect(reachingConfiguration('oxlint', contents)).toBeUndefined()
    expect(reachingConfiguration('oxlint', '/')).toBeUndefined()
  })

  it('matches ignore patterns case-sensitively, as Oxlint does', () => {
    // the generated `**/LICENSE*` must not hide packages/license-checker
    const [root, folder] = nested({ 'oxlint.config.ts': '' }, 'packages/license-checker')
    expect(reachingConfiguration('oxlint', folder)).toBe(path.join(root, 'oxlint.config.ts'))
  })

  it('refuses a config in a folder Git ignores unless it is a repository of its own', () => {
    const [, ignored] = nested({ '.gitignore': 'scratch/\n' }, 'scratch/tool')
    writeFileSync(path.join(ignored, 'oxlint.config.ts'), '')
    expect(() => createOxlintConfiguration({}, { cwd: ignored })).toThrow('whose files Git ignores')

    mkdirSync(path.join(ignored, '.git'))
    expect(() => createOxlintConfiguration({}, { cwd: ignored })).not.toThrow()
  })

  it('follows Git for whitelists, re-includes and worktrees', () => {
    // `*` with `!*/` and `!*.*` ignores only extension-less files: a package config is reached
    const [whitelisted, inside] = nested(
      { '.gitignore': '*\n!*/\n!*.*\n', 'oxlint.config.ts': '' },
      'packages/app',
    )
    expect(reachingConfiguration('oxlint', inside)).toBe(path.join(whitelisted, 'oxlint.config.ts'))

    // a deeper .gitignore re-includes a folder whose parent is not excluded itself
    const [reincluded] = nested({ '.gitignore': 'x/*\n' }, 'x/y')
    writeFileSync(path.join(reincluded, 'x/.gitignore'), '!y/\n')
    writeFileSync(path.join(reincluded, 'x/y/oxlint.config.ts'), '')
    expect(() => createOxlintConfiguration({}, { cwd: path.join(reincluded, 'x/y') })).not.toThrow()

    // ...but nothing below an excluded folder comes back
    const [excluded] = nested({ '.gitignore': 'x/\n' }, 'x/y')
    writeFileSync(path.join(excluded, 'x/.gitignore'), '!y/\n')
    expect(() => createOxlintConfiguration({}, { cwd: path.join(excluded, 'x/y') })).toThrow(
      'whose files Git ignores',
    )

    // a rule for a parent folder decides nothing below a re-included one
    const [parentRule] = nested({ '.gitignore': 'x/*\n' }, 'x/y/z')
    writeFileSync(path.join(parentRule, 'x/.gitignore'), '!y/\n')
    writeFileSync(path.join(parentRule, 'x/y/z/oxlint.config.ts'), '')
    expect(() =>
      createOxlintConfiguration({}, { cwd: path.join(parentRule, 'x/y/z') }),
    ).not.toThrow()

    // ...while `x/**` still matches the files of a re-included folder
    const [allBelow] = nested({ '.gitignore': 'x/**\n' }, 'x/y')
    writeFileSync(path.join(allBelow, 'x/.gitignore'), '!y/\n')
    expect(() => createOxlintConfiguration({}, { cwd: path.join(allBelow, 'x/y') })).toThrow(
      'whose files Git ignores',
    )

    // a nested repository's files follow its own ignore files, so the outer config reaches it
    const [outer] = nested({ '.gitignore': '*\n!*/\n', 'oxlint.config.ts': '' }, 'R/.git')
    expect(reachingConfiguration('oxlint', path.join(outer, 'R'))).toBe(
      path.join(outer, 'oxlint.config.ts'),
    )

    // a submodule's info/exclude is not applied, as in Oxlint
    const [superproject] = nested({}, '.git/modules/sub/info')
    writeFileSync(path.join(superproject, '.git/modules/sub/info/exclude'), 'x/\n')
    mkdirSync(path.join(superproject, 'sub/x'), { recursive: true })
    writeFileSync(path.join(superproject, 'sub/.git'), 'gitdir: ../.git/modules/sub\n')
    writeFileSync(path.join(superproject, 'sub/x/oxlint.config.ts'), '')
    expect(() =>
      createOxlintConfiguration({}, { cwd: path.join(superproject, 'sub/x') }),
    ).not.toThrow()

    // a linked worktree reads the main repository's info/exclude
    const [main] = nested({}, '.git/worktrees/wt')
    mkdirSync(path.join(main, '.git/info'))
    writeFileSync(path.join(main, '.git/info/exclude'), 'x/\n')
    writeFileSync(path.join(main, '.git/worktrees/wt/commondir'), '../..\n')
    const worktree = path.join(main, 'wt')
    mkdirSync(path.join(worktree, 'x'), { recursive: true })
    writeFileSync(path.join(worktree, '.git'), `gitdir: ${path.join(main, '.git/worktrees/wt')}\n`)
    expect(() => createOxlintConfiguration({}, { cwd: path.join(worktree, 'x') })).toThrow(
      'whose files Git ignores',
    )
  })

  it('enables Vue when vue is installed for any workspace package', () => {
    const cwd = project({ 'package.json': JSON.stringify({ name: 'root' }) })
    mkdirSync(path.join(cwd, 'node_modules/.pnpm/vue@3.5.0'), { recursive: true })
    const vue = (createOxlintConfiguration({}, { cwd }).overrides ?? []).filter((override) =>
      override.files.some((glob) => glob.endsWith('.vue')),
    )
    expect(vue.length).toBeGreaterThan(0)
  })

  it("enables Vue from any package manager's lockfile or store, never for a vue-named relative", () => {
    expect(hasVue({ 'pnpm-lock.yaml': 'packages:\n\n  vue@3.5.13:\n    resolution: {}\n' })).toBe(
      true,
    )
    expect(
      hasVue({
        'package-lock.json': '{"packages":{"apps/web/node_modules/vue":{"version":"3.5.13"}}}',
      }),
    ).toBe(true)
    expect(hasVue({ 'yarn.lock': '"vue@npm:^3.5.0":\n  version: 3.5.13\n' })).toBe(true)
    expect(hasVue({ 'bun.lock': '{ "packages": { "vue": ["vue@3.5.13", "", {}] } }' })).toBe(true)
    expect(hasVue({}, 'node_modules/.bun/vue@3.5.13')).toBe(true)
    expect(
      hasVue({
        'pnpm-lock.yaml': "packages:\n\n  vue-router@4.5.0:\n  '@vue/shared@3.5.13':\n",
        'yarn.lock': '"vue-eslint-parser@^10":\n',
      }),
    ).toBe(false)
  })

  it('refuses a package config inside the project, naming the override to write', () => {
    const [root, folder] = nested({ 'oxlint.config.ts': '' }, 'packages/app')
    writeFileSync(path.join(folder, 'oxlint.config.ts'), '')
    expect(() => createOxlintConfiguration({}, { cwd: folder })).toThrow(
      `packages/app/oxlint.config.ts is inside the project of ${path.join(root, 'oxlint.config.ts')}`,
    )
    expect(() => createOxlintConfiguration({}, { cwd: folder })).toThrow(
      "move its settings into oxlint.config.ts as an override for 'packages/app/**'",
    )

    // ESLint looks configs up per file, on the command line and in the editor alike
    writeFileSync(path.join(root, 'eslint.config.mjs'), '')
    writeFileSync(path.join(folder, 'eslint.config.mjs'), '')
    expect(() => createEslintConfiguration({}, { cwd: folder })).not.toThrow()
  })
})

describe('unavailable rules', () => {
  it('leaves json/auto out of the rule index and rejects it at config load with the reason', () => {
    expect(ruleIndex['json/auto']).toBeUndefined()
    expect(() =>
      createEslintConfiguration({ rules: { 'jsonc/auto': 'error' } }, { cwd: project() }),
    ).toThrow(/"jsonc\/auto" is not available in this package: it computes the JavaScript config/)
  })
})
