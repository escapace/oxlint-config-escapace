import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isRecord } from '../src/utilities/is-record.ts'
import { jsonDiagnostics } from './json-output.ts'

// every temporary folder of this file lives here and goes when the file is done
const scratch = mkdtempSync(path.join(tmpdir(), 'esclint-esclint-spec-'))

afterAll(() => {
  rmSync(scratch, { force: true, recursive: true })
})

const root = path.resolve(import.meta.dirname, '..')
const bin = path.join(root, 'lib/node/esclint.js')

// Both engines discover config files upward, so the fixtures run from a copy
// outside this repository, with this repository's node_modules as theirs.
let fixtures = ''

beforeAll(() => {
  fixtures = mkdtempSync(path.join(scratch, 'esclint-fixtures-'))
  cpSync(path.join(root, 'test/fixtures'), fixtures, { recursive: true })
  symlinkSync(path.join(root, 'node_modules'), path.join(fixtures, 'node_modules'), 'dir')
})

interface Run {
  code: number
  stderr: string
  stdout: string
}

const esclintWith = (
  environment: NodeJS.ProcessEnv,
  fixture: string,
  ...arguments_: string[]
): Run => {
  if (!existsSync(bin)) {
    throw new Error('lib/node/esclint.js is missing; run `pnpm run build` before the tests')
  }

  const result = spawnSync(process.execPath, [bin, ...arguments_], {
    cwd: path.isAbsolute(fixture) ? fixture : path.join(fixtures, fixture),
    encoding: 'utf8',
    env: { ...process.env, ...environment },
  })

  return { code: result.status ?? -1, stderr: result.stderr, stdout: result.stdout }
}

const esclint = (fixture: string, ...arguments_: string[]): Run =>
  esclintWith({ FORCE_COLOR: undefined, NO_COLOR: '1' }, fixture, ...arguments_)

/** Whether each stdout line mentioning `text` carries an escape sequence. */
const coloured = (run: Run, text: string): boolean[] =>
  run.stdout
    .split('\n')
    .filter((line) => line.includes(text))
    .map((line) => line.includes('\u001B['))

const codes = (run: Run): string[] =>
  jsonDiagnostics(run.stdout).map((diagnostic) => `${diagnostic.filename}:${diagnostic.code ?? ''}`)

describe('esclint', { timeout: 60_000 }, () => {
  it('runs both engines and merges JSON output', () => {
    const run = esclint('both', '--format', 'json')
    expect(run.code).toBe(1)
    const seen = codes(run)
    expect(seen).toContain('src/index.ts:typescript(no-explicit-any)')
    expect(seen).toContain('src/index.ts:perfectionist(sort-objects)')
    expect(seen).toContain('src/index.ts:escapace(name-replacements)')
    expect(seen).toContain('src/index.ts:typescript(require-await)')
    expect(seen).toContain('config.yaml:yaml(sort-keys)')
    expect(seen).toContain('data.json:json(sort-keys)')
  })

  it('prints a summary line per engine in the default format', () => {
    const run = esclint('both')
    expect(run.code).toBe(1)
    expect(run.stdout).toContain('yaml(sort-keys)')
    expect(run.stderr).toMatch(/eslint: Found 0 warnings and 2 errors\./)
  })

  it('colours both engines or neither', () => {
    // an explicit default format, since agent environments switch Oxlint to another one
    const forced = esclintWith(
      { FORCE_COLOR: undefined, NO_COLOR: '1' },
      'both',
      '--color',
      '--format',
      'default',
    )
    expect(forced.code).toBe(1)
    expect(coloured(forced, 'no-explicit-any')).toContain(true)
    expect(coloured(forced, 'yaml(sort-keys)')).toEqual([true])
    expect(coloured(forced, 'json(sort-keys)')).toEqual([true])

    const plain = esclintWith({ FORCE_COLOR: '1' }, 'both', '--no-color', '--format', 'default')
    expect(plain.code).toBe(1)
    expect(plain.stdout).toContain('yaml(sort-keys)')
    expect(plain.stdout).not.toContain('\u001B[')

    // the flags never change the exit code: both engines lint these two files clean
    for (const flag of ['--color', '--no-color']) {
      expect(esclint('both', flag, 'package.json', 'oxlint.config.ts').code).toBe(0)
    }
  })

  it('honours --no-color in CI even when FORCE_COLOR is set', () => {
    const plain = esclintWith(
      { CI: 'true', FORCE_COLOR: '1', GITHUB_ACTIONS: 'true', NO_COLOR: undefined },
      'both',
      '--no-color',
      '--format',
      'default',
    )
    expect(plain.code).toBe(1)
    expect(plain.stdout).toContain('no-explicit-any')
    expect(plain.stdout).toContain('yaml(sort-keys)')
    expect(plain.stdout).not.toContain('\u001B[')
    expect(plain.stderr).not.toContain('\u001B[')
  })

  it('skips the residual when only oxlint.config.ts exists, even for YAML paths', () => {
    const run = esclint('oxlint-only')
    expect(run.code).toBe(1)
    expect(run.stderr).not.toContain('skipped')
    expect(run.stdout).not.toContain('yaml(')

    const yamlOnly = esclint('oxlint-only', 'config.yaml')
    expect(yamlOnly.code).toBe(0)
  })

  it('skips Oxlint when only eslint.config.mjs exists and ignores Oxlint-only flags', () => {
    const run = esclint('eslint-only', '--type-aware')
    expect(run.code).toBe(1)
    expect(run.stderr).not.toContain('skipped')
    expect(run.stdout).toContain('yaml(sort-keys)')

    const scriptOnly = esclint('eslint-only', 'index.ts')
    expect(scriptOnly.code).toBe(0)
  })

  it('fails with a hint when neither config file exists', () => {
    const run = esclint('neither')
    expect(run.code).toBe(1)
    expect(run.stderr).toContain('no oxlint.config.ts or eslint.config.mjs')
    expect(run.stderr).toContain('README')
  })

  it('prints one JSON document even when it fails before linting', () => {
    const empty = { diagnostics: [], number_of_files: 0, number_of_rules: 0 }

    for (const run of [
      esclint('neither', '--format', 'json'),
      esclint('both', '--format=json', '--max-warnings'),
      esclint('both', '-f', 'json', '-A'),
    ]) {
      expect(run.code).toBe(1)
      expect(run.stderr).toContain('esclint: ')
      expect(JSON.parse(run.stdout)).toEqual(empty)
    }

    expect(esclint('neither', '--format', 'json', '--silent').stdout).toBe('')
    expect(esclint('neither').stdout).toBe('')
  })

  it("refuses --init rather than letting Oxlint's write an .oxlintrc.json", () => {
    const directory = mkdtempSync(path.join(scratch, 'esclint-no-init-'))
    writeFileSync(path.join(directory, 'a.ts'), 'export const a = 1\n')
    const run = esclint(directory, '--init')
    expect(run.code).toBe(1)
    expect(run.stderr).toContain('--init is not supported')
    expect(readdirSync(directory)).toEqual(['a.ts'])
  })

  it('treats unmatched paths as a clean run', () => {
    const run = esclint('both', 'missing.ts', 'missing.yaml')
    expect(run.code).toBe(0)
  })

  it('applies severity overrides, quiet and max-warnings to the residual', () => {
    expect(codes(esclint('both', '--format', 'json', '-A', 'yaml/sort-keys'))).not.toContain(
      'config.yaml:yaml(sort-keys)',
    )
    expect(esclint('eslint-only', '--quiet').stdout).toContain('yaml(sort-keys)')
  })

  it('refuses Oxlint-only formats while the residual is non-empty', () => {
    const run = esclint('both', '--format', 'sarif')
    expect(run.code).toBe(1)
    expect(run.stderr).toContain('--format sarif is Oxlint-only')
    expect(esclint('oxlint-only', '--format', 'sarif').stdout).toContain('"version": "2.1.0"')
  })

  it('renders github and unix lines for residual diagnostics', () => {
    expect(esclint('eslint-only', '--format', 'github').stdout).toMatch(
      /^::error file=config\.yaml,line=1,.*title=yaml\(sort-keys\)::/m,
    )
    expect(esclint('eslint-only', '--format', 'unix').stdout).toMatch(
      /^config\.yaml:1:1: .* \[Error\/yaml\(sort-keys\)\]$/m,
    )
  })

  it('fixes through both engines', () => {
    const directory = path.join(fixtures, 'both-fix')
    cpSync(path.join(fixtures, 'both'), directory, { recursive: true })
    const run = esclint(directory, '--fix', 'src/index.ts', 'config.yaml')
    expect(run.stderr).not.toContain('Failed')
    expect(readFileSync(path.join(directory, 'config.yaml'), 'utf8')).toBe('apple: 2\nzebra: 1\n')
    expect(readFileSync(path.join(directory, 'src/index.ts'), 'utf8')).toContain('{ a: 2, b: 1 }')
  })

  it('prints both resolved configurations', () => {
    const run = esclint('both', '--print-config')
    expect(run.code).toBe(0)
    expect(run.stdout).toContain('// oxlint')
    expect(run.stdout).toContain('// eslint residual')
    expect(run.stdout).toContain('"jsPlugins"')
  })

  it('lints Vue script blocks with Oxlint and templates with the residual', () => {
    const seen = codes(esclint('vue', '--format', 'json'))
    expect(seen).toContain('src/App.vue:typescript(no-explicit-any)')
    expect(seen).toContain('src/App.vue:vue(require-v-for-key)')
    expect(seen).toContain('src/index.ts:typescript(no-explicit-any)')
  })

  it('lints Astro frontmatter with Oxlint and templates with the residual, under one accessibility policy', () => {
    const seen = codes(esclint('astro', '--format', 'json'))
    expect(seen).toContain('src/pages/index.astro:typescript(no-explicit-any)')
    expect(seen).toContain('src/pages/index.astro:astro(jsx-a11y/alt-text)')
    expect(seen).toContain('src/card.tsx:jsx-a11y(alt-text)')
  })

  it('reports versions and help', () => {
    expect(esclint('both', '--version').stdout).toMatch(/^esclint \d+\.\d+\.\d+/)
    expect(esclint('both', '--help').stdout).toContain('--print-config')
  })
})

/** A copy of a fixture with extra files, for scenarios that need their own tree. */
const scenario = (base: string, name: string, files: Record<string, string>): string => {
  const directory = path.join(fixtures, `${base}-${name}`)
  cpSync(path.join(fixtures, base), directory, { recursive: true })

  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(directory, file)), { recursive: true })
    writeFileSync(path.join(directory, file), content)
  }

  return directory
}

/** The first label span of each diagnostic in a JSON document, keyed by its code. */
const spans = (stdout: string): Map<string, unknown> => {
  const document: unknown = JSON.parse(stdout)
  const result = new Map<string, unknown>()

  if (isRecord(document) && Array.isArray(document.diagnostics)) {
    for (const diagnostic of document.diagnostics) {
      if (
        isRecord(diagnostic) &&
        typeof diagnostic.code === 'string' &&
        Array.isArray(diagnostic.labels)
      ) {
        const label: unknown = diagnostic.labels[0]
        result.set(diagnostic.code, isRecord(label) ? label.span : undefined)
      }
    }
  }

  return result
}

/** The diagnostics of the generated files in the ignore-pattern scenario. */
const generated = (run: Run): string[] => codes(run).filter((entry) => entry.includes('gen/g.'))

describe('esclint command line', { timeout: 60_000 }, () => {
  it('reads flags and paths after --, as `pnpm lint -- …` passes them', () => {
    const seen = codes(esclint('both', '--', '--format', 'json', 'src/index.ts', 'config.yaml'))
    expect(seen).toContain('src/index.ts:typescript(no-explicit-any)')
    expect(seen).toContain('config.yaml:yaml(sort-keys)')
  })

  it('applies --ignore-pattern the same way in both engines, from any folder', () => {
    const directory = scenario('both', 'ignore-pattern', {
      'sub/gen/g.ts': 'export const value: any = 1\n',
      'sub/gen/g.yaml': 'zebra: 1\napple: 2\n',
    })
    expect(generated(esclint(directory, '--format', 'json'))).toHaveLength(2)
    expect(generated(esclint(directory, '--format', 'json', '--ignore-pattern', 'gen/'))).toEqual(
      [],
    )
    expect(
      generated(
        esclint(path.join(directory, 'sub'), '--format', 'json', '--ignore-pattern', 'gen'),
      ),
    ).toEqual([])
  })

  it('fails on a missing --ignore-path before either engine runs', () => {
    const run = esclint('both', '--format', 'json', '--ignore-path', 'missing.txt')
    expect(run.code).toBe(1)
    expect(run.stderr).toContain('--ignore-path missing.txt does not exist')
    expect(jsonDiagnostics(run.stdout)).toEqual([])
  })

  it("places ESLint's diagnostics by offset in JSON, as Oxlint's", () => {
    const directory = scenario('both', 'offsets', { 'config.yaml': '# keys\nzebra: 1\napple: 2\n' })
    const span = spans(esclint(directory, '--format', 'json', 'config.yaml').stdout).get(
      'yaml(sort-keys)',
    )
    expect(span).toMatchObject({ column: 1, length: 5, line: 2, offset: 7 })
  })

  it("sorts every task keyword of Ansible's reference as a keyword, never as the module", () => {
    const directory = scenario('eslint-only', 'ansible-keywords', {
      'roles/web/tasks/main.yaml': [
        '- name: Read the secret',
        '  ansible.builtin.command: cat /etc/secret',
        '  register: secret',
        '  changed_when: false',
        '  no_log: true',
        '  ignore_errors: true',
        '  any_errors_fatal: true',
        '  with_community.general.random_words: 2',
        '  when: enabled',
        '',
      ].join('\n'),
    })
    expect(codes(esclint(directory, '--format', 'json', 'roles'))).toEqual([])
  })

  it('agrees with oxfmt: lint, then format, leaves nothing for either to change', () => {
    const directory = scenario('both', 'oxfmt-agreement', {
      'list.yaml': 'list:\n  - - inner\n    - more\n',
      'pyproject.toml': '[project]\ndependencies = ["pytest", "ruff"]\n',
      'src/layout.ts': [
        'declare const a: number, b: number, c: number',
        'export const comparison = (a < b) === (b < c)',
        'export const iife = (function () {',
        '  return 1',
        '})()',
        '',
      ].join('\n'),
      'src/view.tsx': [
        'declare const condition: boolean',
        'export const view = condition ? <p className="a fairly long class name for the true branch">yes</p> : <span className="another long class name">no</span>',
        '',
      ].join('\n'),
    })
    const files = ['list.yaml', 'pyproject.toml', 'src/layout.ts', 'src/view.tsx']
    const oxfmt = (...arguments_: string[]) =>
      spawnSync(path.join(root, 'node_modules/oxfmt/bin/oxfmt'), [...arguments_, ...files], {
        cwd: directory,
        encoding: 'utf8',
      })

    esclint(directory, '--fix', ...files)
    oxfmt()
    esclint(directory, '--fix', ...files)
    expect(oxfmt('--check').status).toBe(0)
  })

  it('leaves a workflow matrix in the order written, which names its jobs', () => {
    const workflow = [
      'name: CI',
      'on: push',
      'jobs:',
      '  test:',
      '    runs-on: ${{ matrix.os }}',
      '    strategy:',
      '      matrix:',
      '        os: [ubuntu-latest, windows-latest]',
      '        node: [20, 22]',
      '    steps:',
      '      - run: npm test',
      '',
    ].join('\n')
    const directory = scenario('eslint-only', 'matrix-order', {
      '.github/workflows/ci.yaml': workflow,
    })
    expect(codes(esclint(directory, '--format', 'json', '.github'))).toEqual([])

    // the alphabetical fallback still applies to the matrix's own entries
    writeFileSync(
      path.join(directory, '.github/workflows/ci.yaml'),
      workflow.replace(
        '        node: [20, 22]',
        '        node: [20, 22]\n        include:\n          - os: macos-latest\n            node: 22',
      ),
    )
    expect(codes(esclint(directory, '--format', 'json', '.github'))).toEqual([
      '.github/workflows/ci.yaml:yaml(sort-keys)',
    ])
  })

  it('keeps stdout one JSON document with --debug files', () => {
    const run = esclint('both', '--format', 'json', '--debug', 'files')
    expect(() => JSON.parse(run.stdout) as unknown).not.toThrow()
    expect(run.stderr).toContain('config.yaml')
  })
})

describe('esclint review scenarios', { timeout: 60_000 }, () => {
  it('routes -A/-W/-D to the residual only for residual rules, aliases included', () => {
    expect(esclint('both', '-D', 'typescript/no-explicit-any').stderr).not.toContain(
      'Could not find plugin',
    )

    const warned = esclint('eslint-only', '-W', 'yaml/sort-keys', '--format', 'json')
    expect(warned.stderr).not.toContain('Could not find plugin')
    expect(
      jsonDiagnostics(warned.stdout).find((diagnostic) => diagnostic.code === 'yaml(sort-keys)')
        ?.severity,
    ).toBe('warning')

    expect(esclint('eslint-only', '-A', 'yml/sort-keys', 'config.yaml').stdout).not.toContain(
      'yaml(sort-keys)',
    )
  })

  it('counts warnings hidden by --quiet against the thresholds', () => {
    const run = esclint(
      'eslint-only',
      '-W',
      'yaml/sort-keys',
      '--quiet',
      '--deny-warnings',
      'config.yaml',
    )
    expect(run.code).toBe(1)
    expect(run.stdout).not.toContain('yaml(sort-keys)')
  })

  it('splits a consumer override across residual languages', () => {
    const directory = scenario('eslint-only', 'override', {
      'deploy/a.yaml': 'a: 1\n',
      'deploy/b.json': '{ "a": 1 }\n',
      'eslint.config.mjs':
        "import { escapace } from 'oxlint-config-escapace/eslint'\n\nexport default escapace({ overrides: [{ files: ['deploy/**'], rules: { 'yaml/quotes': 'off' } }] })\n",
    })
    const run = esclint(directory, 'deploy')
    expect(run.stderr).not.toContain('Could not find plugin')
    expect(run.code).toBe(0)
  })

  it('accepts comments in tsconfig files and never parses JavaScript in the residual', () => {
    const directory = scenario('eslint-only', 'overlap', {
      'tsconfig.json': '{\n  // comment\n  "compilerOptions": {}\n}\n',
      'web/app.js': 'export const App = () => <div />\n',
    })
    const run = esclint(directory, 'tsconfig.json', 'web')
    expect(run.stdout).not.toContain('no-comments')
    expect(run.stdout).not.toContain('Parsing error')
    expect(run.code).toBe(0)
  })

  it('reads .lintignore with gitignore semantics from the config directory', () => {
    const directory = scenario('eslint-only', 'ignore', {
      '.lintignore': '/generated\nbuild\n',
      'generated/x.yaml': 'b: 1\na: 2\n',
      'nested/build/y.yaml': 'b: 1\na: 2\n',
      'nested/z.yaml': 'b: 1\na: 2\n',
    })
    const fromRoot = esclint(directory, '--format', 'unix')
    expect(fromRoot.stdout).not.toContain('generated/x.yaml')
    expect(fromRoot.stdout).not.toContain('build/y.yaml')
    expect(fromRoot.stdout).toContain('nested/z.yaml')

    const fromSubdirectory = esclint(path.join(directory, 'nested'), '--format', 'unix')
    expect(fromSubdirectory.stdout).not.toContain('build/y.yaml')
    expect(fromSubdirectory.stdout).toContain('z.yaml')
  })

  it('lints directories whose names contain a dot', () => {
    const directory = scenario('eslint-only', 'dotted', { 'pkg.v2/c.yaml': 'b: 1\na: 2\n' })
    expect(esclint(directory, 'pkg.v2').stdout).toContain('yaml(sort-keys)')
  })

  it('lists residual files for --debug=files without linting them', () => {
    const run = esclint('eslint-only', '--debug=files')
    expect(run.stdout).toContain('config.yaml')
    expect(run.stdout).not.toContain('sort-keys')
    expect(run.code).toBe(0)
  })

  it('applies the GitHub workflow key order', () => {
    const directory = scenario('eslint-only', 'workflow', {
      '.github/workflows/ci.yaml': 'on: push\nname: ci\njobs: {}\n',
    })
    expect(esclint(directory, '.github', '--format', 'unix').stdout).toMatch(
      /ci\.yaml:1:1: Expected mapping keys to be in specified order\. 'on' should be after 'name'\./,
    )
  })

  it('runs Oxlint-only commands without a config file', () => {
    const run = esclint('neither', '--rules', '--format', 'json')
    expect(run.code).toBe(0)
  })
})

describe('esclint second review scenarios', { timeout: 60_000 }, () => {
  it('refuses a package config inside the project and takes package settings as overrides', () => {
    const refused = scenario('oxlint-only', 'nested', {
      'packages/app/oxlint.config.ts':
        "import { escapace } from 'oxlint-config-escapace'\n\nexport default escapace()\n",
      'packages/app/src/a.ts': 'export const value: any = 1\n',
    })
    const run = esclint(refused, '--format', 'json')
    // Oxlint wraps long messages behind a `|` gutter
    const message = run.stderr.replaceAll(/\n *\| ?/g, ' ')
    expect(run.code).toBe(1)
    expect(message).toContain('packages/app/oxlint.config.ts is inside the project of')
    expect(message).toContain("as an override for 'packages/app/**'")

    const overridden = scenario('oxlint-only', 'override', {
      'oxlint.config.ts':
        "import { escapace } from 'oxlint-config-escapace'\n\nexport default escapace({ overrides: [{ files: ['packages/app/**'], rules: { 'typescript/no-explicit-any': 'off' } }] })\n",
      'packages/app/src/a.ts': 'export const value: any = 1\n',
      'packages/other/src/b.ts': 'export const value: any = 1\n',
    })
    const fromRoot = codes(esclint(overridden, '--format', 'json'))
    expect(fromRoot).not.toContain('packages/app/src/a.ts:typescript(no-explicit-any)')
    expect(fromRoot).toContain('packages/other/src/b.ts:typescript(no-explicit-any)')
    expect(codes(esclint(path.join(overridden, 'packages/app'), '--format', 'json'))).toEqual([])
  })

  it('reports but never autofixes name-replacements in Vue files', () => {
    const file =
      '<script setup lang="ts">\nconst repo = { a: 1 }\n</script>\n\n<template>\n  <div>{{ repo.a }}</div>\n</template>\n'
    const directory = scenario('vue', 'rename', { 'src/Rename.vue': file })
    esclint(directory, '--fix', 'src/Rename.vue')
    expect(readFileSync(path.join(directory, 'src/Rename.vue'), 'utf8')).toContain('const repo =')
  })

  it('runs every Vue rule the index accepts and prints the Vue config', () => {
    expect(esclint('vue', '-W', 'vue/html-indent', 'src/App.vue').stderr).not.toContain(
      'Could not find',
    )
    const printed = esclint('vue', '--print-config', 'src/App.vue')
    expect(printed.code).toBe(0)
    expect(printed.stdout).toContain('escapace/vue')
  })

  it('forwards --format to Oxlint-only commands and always prints one JSON document', () => {
    const rules = esclint('neither', '--rules', '--format', 'json')
    expect(() => JSON.parse(rules.stdout) as unknown).not.toThrow()

    const unmatched = esclint('both', '--format', 'json', 'README.md')
    expect(jsonDiagnostics(unmatched.stdout)).toEqual([])
  })

  it('applies nested .gitignore files and ignorePatterns with gitignore semantics in the residual', () => {
    const directory = scenario('eslint-only', 'nested-ignore', {
      'a/fixtures/x.yaml': 'b: 1\na: 2\n',
      'eslint.config.mjs':
        "import { escapace } from 'oxlint-config-escapace/eslint'\n\nexport default escapace({ ignorePatterns: ['fixtures'] })\n",
      'sub/.gitignore': 'out/\n',
      'sub/out/x.yaml': 'b: 1\na: 2\n',
    })
    const run = esclint(directory, '--format', 'unix')
    expect(run.stdout).not.toContain('fixtures/x.yaml')
    expect(run.stdout).not.toContain('out/x.yaml')
    expect(run.stdout).toContain('config.yaml')
  })
})

/** A workspace whose package `packages/app` has type-aware findings, with its own config if asked. */
const nested = (name: string, packageConfig = false): string =>
  scenario('oxlint-only', name, {
    ...(packageConfig
      ? {
          'packages/app/oxlint.config.ts':
            "import { escapace } from 'oxlint-config-escapace'\n\nexport default escapace()\n",
        }
      : {}),
    'packages/app/src/b.ts':
      'export const read = async (value: Promise<number>): Promise<number> => {\n  const result: any = value\n\n  return result\n}\n',
    'packages/app/tsconfig.json': JSON.stringify({
      compilerOptions: {
        module: 'esnext',
        moduleResolution: 'bundler',
        noEmit: true,
        strict: true,
        target: 'es2024',
        types: [],
      },
      include: ['src'],
    }),
  })

describe('esclint third review scenarios', { timeout: 60_000 }, () => {
  it('keeps type-aware linting from a package folder and with -c', () => {
    const directory = nested('config-flag')
    expect(codes(esclint(path.join(directory, 'packages/app'), '--format', 'json'))).toContain(
      'src/b.ts:typescript(no-unsafe-return)',
    )
    const run = esclint(
      directory,
      '-c',
      'oxlint.config.ts',
      '--format',
      'json',
      'packages/app/src/b.ts',
    )
    expect(codes(run)).toContain('packages/app/src/b.ts:typescript(no-unsafe-return)')
  })

  it('never reads a stray config in a .lintignore folder, from a subdirectory too', () => {
    const directory = scenario('oxlint-only', 'stray', {
      '.lintignore': 'packages/b/generated/\n',
      'packages/b/generated/oxlint.config.ts': 'export default {{{\n',
      'packages/b/src/x.ts': 'export const value: any = 1\n',
    })
    const run = esclint(path.join(directory, 'packages/b'), '--format', 'json')
    expect(run.stderr).not.toContain('Failed to load config')
    expect(codes(run)).toContain('src/x.ts:typescript(no-explicit-any)')
  })

  it('refuses a project in a git-ignored folder before Oxlint skips all its files', () => {
    const directory = scenario('oxlint-only', 'git-ignored', {
      '.gitignore': 'vendor/\n',
      'vendor/proj/oxlint.config.ts':
        "import { escapace } from 'oxlint-config-escapace'\n\nexport default escapace()\n",
      'vendor/proj/src/a.ts': 'export const value: any = 1\n',
    })
    const run = esclint(path.join(directory, 'vendor/proj'))
    expect(run.code).toBe(1)
    expect(run.stderr).toContain('is in a folder whose files Git ignores')
  })

  it('treats package configs as separate projects when no root config exists', () => {
    const directory = nested('rootless', true)
    rmSync(path.join(directory, 'oxlint.config.ts'))
    const oxlint = path.join(root, 'node_modules/oxlint/bin/oxlint')
    const result = spawnSync(
      process.execPath,
      [oxlint, '--format', 'json', '--no-error-on-unmatched-pattern'],
      {
        cwd: directory,
        encoding: 'utf8',
      },
    )
    expect(result.stdout + result.stderr).not.toContain('only supported in the root config')
  })
})

describe('esclint fourth review scenarios', { timeout: 60_000 }, () => {
  it('reports an eslint-disable comment for Oxlint rules in a .vue script once, as Oxlint ignores it', () => {
    const directory = scenario('vue', 'directives', {
      'src/Directives.vue':
        '<script setup lang="ts">\n// eslint-disable-next-line typescript/no-explicit-any\nconst items: any = [1, 2]\n</script>\n\n<template>\n  <!-- eslint-disable-next-line vue/require-v-for-key -->\n  <div v-for="item in items">{{ item }}</div>\n</template>\n',
    })
    const run = esclint(directory, '--format', 'json', 'src/Directives.vue')
    const messages = jsonDiagnostics(run.stdout).map((diagnostic) => diagnostic.message)
    expect(messages.filter((message) => message.includes('was not found'))).toEqual([])
    expect(messages.filter((message) => message.includes('Unused'))).toEqual([])
    expect(
      messages.filter((message) => message.startsWith('Oxlint ignores eslint-disable-next-line')),
    ).toHaveLength(1)
    expect(messages.some((message) => message.includes('`any`'))).toBe(true)
    expect(
      messages.some(
        (message) => message.includes('require-v-for-key') || message.includes('v-for'),
      ),
    ).toBe(false)
  })
})

/** A Vue file with `script` in its `<script>` block and a template that needs no comments. */
const vueWith = (script: string): string =>
  `<script setup lang="ts">\nconst items = [1, 2]\n${script}\n</script>\n\n<template>\n  <div v-for="item in items" :key="item">{{ item }}</div>\n</template>\n`

describe('disable comment lanes', { timeout: 60_000 }, () => {
  it('ignores eslint-disable comments in TypeScript and renames them with --fix', () => {
    const directory = scenario('oxlint-only', 'lanes', {
      'src/lanes.ts':
        '// eslint-disable-next-line no-debugger -- kept reason\ndebugger\n/* eslint-disable no-console */\nexport const value = 1\n',
    })
    const before = codes(esclint(directory, '--format', 'json', 'src/lanes.ts'))
    expect(before).toContain('src/lanes.ts:eslint(no-debugger)')
    expect(
      before.filter((entry) => entry === 'src/lanes.ts:escapace(no-eslint-directives)'),
    ).toHaveLength(2)

    esclint(directory, '--fix', 'src/lanes.ts')
    expect(readFileSync(path.join(directory, 'src/lanes.ts'), 'utf8')).toBe(
      '// oxlint-disable-next-line no-debugger -- kept reason\ndebugger\n/* oxlint-disable no-console */\nexport const value = 1\n',
    )
    expect(codes(esclint(directory, '--format', 'json', 'src/lanes.ts'))).not.toContain(
      'src/lanes.ts:eslint(no-debugger)',
    )
  })

  it('reports unused oxlint-disable comments in Vue projects too', () => {
    const directory = scenario('vue', 'unused-lanes', {
      'src/unused.ts': '// oxlint-disable-next-line no-debugger\nexport const value = 1\n',
    })
    const run = esclint(directory, '--format', 'unix', 'src/unused.ts')
    expect(run.stdout).toContain('Unused oxlint-disable directive')
  })

  it('splits a mixed eslint-disable comment in a .vue script only by hand, as the message says', () => {
    const directory = scenario('vue', 'split-lanes', {
      'src/Split.vue': vueWith(
        '// eslint-disable-next-line eqeqeq, vue/no-unused-properties\nexport const same = items.length == 2',
      ),
    })
    const run = esclint(directory, '--format', 'unix', 'src/Split.vue')
    expect(run.stdout).toContain(
      'end the line this comment disables with // oxlint-disable-line eqeqeq',
    )
    esclint(directory, '--fix', 'src/Split.vue')
    expect(readFileSync(path.join(directory, 'src/Split.vue'), 'utf8')).toContain(
      '// eslint-disable-next-line eqeqeq, vue/no-unused-properties',
    )

    writeFileSync(
      path.join(directory, 'src/Split.vue'),
      vueWith(
        '// eslint-disable-next-line vue/no-unused-properties\nexport const same = items.length == 2 // oxlint-disable-line eqeqeq\nexport const other = items.length == 3 /* eslint-disable-line vue/no-unused-properties */ // oxlint-disable-line eqeqeq',
      ),
    )
    const split = esclint(directory, '--format', 'unix', 'src/Split.vue').stdout
    expect(split).not.toContain('eqeqeq')
    expect(split).not.toContain('no-eslint-directives')
  })

  it("never touches a .vue comment ESLint may own, even where ESLint doesn't lint Vue", () => {
    const file =
      '<script setup lang="ts">\n/* eslint-disable */\n// eslint-disable-next-line vue/no-unused-properties\nexport const a = 1\n// eslint-disable-next-line no-debugger\ndebugger\n</script>\n'
    const directory = scenario('both', 'vue-less-lanes', { 'src/Card.vue': file })
    esclint(directory, '--fix', 'src/Card.vue')
    expect(readFileSync(path.join(directory, 'src/Card.vue'), 'utf8')).toBe(
      file.replace(
        '// eslint-disable-next-line no-debugger',
        '// oxlint-disable-next-line no-debugger',
      ),
    )
  })
})

describe('esclint fifth review scenarios', { timeout: 60_000 }, () => {
  it('never lets ESLint fix away the Oxlint rules of a mixed directive in a .vue script', () => {
    const directory = scenario('vue', 'mixed-directive', {
      'src/Mixed.vue':
        '<script setup lang="ts">\nconst items = [1, 2]\n// eslint-disable-next-line eqeqeq, vue/no-unused-properties\nexport const same = items.length == 2\n</script>\n\n<template>\n  <div v-for="item in items" :key="item">{{ item }}</div>\n</template>\n',
    })
    spawnSync(
      process.execPath,
      [path.join(root, 'node_modules/eslint/bin/eslint.js'), '--fix', 'src/Mixed.vue'],
      {
        cwd: directory,
        encoding: 'utf8',
      },
    )
    expect(readFileSync(path.join(directory, 'src/Mixed.vue'), 'utf8')).toContain(
      'eslint-disable-next-line eqeqeq',
    )
  })
})

describe('esclint sixth review scenarios', { timeout: 60_000 }, () => {
  it('keeps blanket and residual-rule directives in Vue scripts through esclint --fix', () => {
    // a blanket comment now disables only ESLint's rules; ESLint reports it unused but never deletes it
    const file =
      '<script setup lang="ts">\nconst items = [1, 2]\n// eslint-disable-next-line\nexport const same = items.length == 2\n// eslint-disable-next-line vue/define-macros-order\nconst { unused } = defineProps<{ unused: string }>()\n</script>\n\n<template>\n  <div v-for="item in items" :key="item">{{ item }}{{ unused }}</div>\n</template>\n'
    const directory = scenario('vue', 'kept-directives', { 'src/Kept.vue': file })
    esclint(directory, '--fix', 'src/Kept.vue')
    const after = readFileSync(path.join(directory, 'src/Kept.vue'), 'utf8')
    expect(after).toContain('// eslint-disable-next-line\n')
    expect(after).toContain('// eslint-disable-next-line vue/define-macros-order')
  })
})
