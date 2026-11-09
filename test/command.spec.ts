import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { parseArguments } from '../src/command/arguments.ts'
import { colourEnvironment, wantsColour } from '../src/command/colour.ts'
import { hintFor, ignoreArguments } from '../src/command/oxlint.ts'
import { renderGithub, renderStylish, renderUnix } from '../src/command/renderers/render.ts'
import { toOxlintCode } from '../src/command/renderers/diagnostic.ts'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { partitionPaths } from '../src/command/partition.ts'

// every temporary folder of this file lives here and goes when the file is done
const scratch = mkdtempSync(path.join(tmpdir(), 'esclint-command-spec-'))

afterAll(() => {
  rmSync(scratch, { force: true, recursive: true })
})

describe('parseArguments', () => {
  it('separates paths from flags and forwards shared flags', () => {
    const parsed = parseArguments(['--fix', 'src', 'config.yaml', '--quiet', '--threads', '2'])
    expect(parsed.paths).toEqual(['src', 'config.yaml'])
    expect(parsed.fix).toBe(true)
    expect(parsed.quiet).toBe(true)
    expect(parsed.forwarded).toEqual(['--fix', '--quiet', '--threads', '2'])
  })

  it('reads --format in every spelling and keeps it off the forwarded list', () => {
    expect(parseArguments(['--format=json']).format).toBe('json')
    expect(parseArguments(['-f=json']).format).toBe('json')
    expect(parseArguments(['-A=yaml/sort-keys']).severityOverrides).toEqual([
      ['off', 'yaml/sort-keys'],
    ])
    expect(parseArguments(['-f', 'unix']).format).toBe('unix')
    expect(parseArguments(['--format', 'github']).forwarded).toEqual([])
  })

  it('collects severity overrides in order', () => {
    const parsed = parseArguments(['-A', 'yaml/sort-keys', '--deny', 'correctness', '-W', 'x/y'])
    expect(parsed.severityOverrides).toEqual([
      ['off', 'yaml/sort-keys'],
      ['error', 'correctness'],
      ['warn', 'x/y'],
    ])
  })

  it('maps the unused-directive flags', () => {
    expect(
      parseArguments(['--report-unused-disable-directives']).reportUnusedDisableDirectives,
    ).toBe('warn')
    expect(
      parseArguments(['--report-unused-disable-directives-severity', 'deny'])
        .reportUnusedDisableDirectives,
    ).toBe('error')
  })

  it('never forwards the always-on unmatched-pattern flag twice', () => {
    expect(parseArguments(['--no-error-on-unmatched-pattern']).forwarded).toEqual([])
  })

  it('recognises the bin-owned commands', () => {
    expect(parseArguments(['--print-config']).printConfig).toBe(true)
    expect(parseArguments(['--rules']).exec).toBe(true)
    expect(parseArguments(['--debug=files']).debugFiles).toBe(true)
  })

  it("refuses --init instead of forwarding Oxlint's, which would write a competing .oxlintrc.json", () => {
    expect(() => parseArguments(['--init'])).toThrow('--init is not supported')
  })

  it('rejects a value flag without a value', () => {
    expect(() => parseArguments(['--max-warnings'])).toThrow('--max-warnings expects a value')
  })

  it('names the formats when --format gets another value, before either engine runs', () => {
    expect(() => parseArguments(['--format', 'pretty'])).toThrow(
      '--format pretty is not one of agent, checkstyle, default',
    )
    expect(parseArguments(['-f', 'agent']).format).toBe('agent')
  })

  it('drops --, which pnpm passes on with `pnpm lint -- --fix`, and keeps reading flags', () => {
    expect(parseArguments(['src', '--', '--fix', './-a.ts'])).toMatchObject({
      fix: true,
      forwarded: ['--fix'],
      paths: ['src', './-a.ts'],
    })
  })

  it('takes values attached to short flags, as Oxlint does', () => {
    expect(parseArguments(['-fjson', '-Ayaml/sort-keys'])).toMatchObject({
      format: 'json',
      severityOverrides: [['off', 'yaml/sort-keys']],
    })
  })

  it('rejects a --max-warnings that is not a whole number', () => {
    expect(() => parseArguments(['--max-warnings', 'abc'])).toThrow(
      '--max-warnings expects a whole number, not abc',
    )
    expect(parseArguments(['--max-warnings=0']).maxWarnings).toBe(0)
  })

  it('keeps the colour flags for itself, since Oxlint has none', () => {
    expect(parseArguments(['--color', 'src'])).toMatchObject({ color: true, forwarded: [] })
    expect(parseArguments(['--no-color'])).toMatchObject({ color: false, forwarded: [] })
    expect(parseArguments([]).color).toBeUndefined()
  })
})

describe('colour', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('lets the flag win, then follows Node: FORCE_COLOR before NO_COLOR', () => {
    vi.stubEnv('NO_COLOR', '1')
    vi.stubEnv('FORCE_COLOR', undefined)
    expect(wantsColour(true)).toBe(true)
    expect(wantsColour(undefined)).toBe(false)
    vi.stubEnv('FORCE_COLOR', '1')
    expect(wantsColour(undefined)).toBe(true)
    expect(wantsColour(false)).toBe(false)
    vi.stubEnv('FORCE_COLOR', '0')
    expect(wantsColour(undefined)).toBe(false)
  })

  it('removes CI only from the colour-disabled Oxlint environment', () => {
    const environment = { CI: 'true', GITHUB_ACTIONS: 'true' }
    expect(colourEnvironment(false, environment)).toEqual({
      GITHUB_ACTIONS: 'true',
      NO_COLOR: '1',
    })
    expect(colourEnvironment(true, environment)).toEqual({ ...environment, FORCE_COLOR: '1' })
    expect(environment).toEqual({ CI: 'true', GITHUB_ACTIONS: 'true' })
  })

  it('tells Oxlint the decision without leaving a contradicting variable', () => {
    expect(colourEnvironment(false, { FORCE_COLOR: '0', PATH: '/bin' })).toEqual({
      NO_COLOR: '1',
      PATH: '/bin',
    })
    expect(colourEnvironment(true, { NO_COLOR: '1', NODE_DISABLE_COLORS: '1' })).toEqual({
      FORCE_COLOR: '1',
    })
    expect(colourEnvironment(true, { FORCE_COLOR: '3' })).toEqual({ FORCE_COLOR: '3' })
    expect(colourEnvironment(true, { FORCE_COLOR: 'false' })).toEqual({ FORCE_COLOR: '1' })
  })
})

/** The patterns esclint forwards to Oxlint as `--ignore-pattern`. */
const forwarded = (cwd: string, configurationDirectory: string): string[] =>
  ignoreArguments(cwd, configurationDirectory, parseArguments([])).filter(
    (_value, index, all) => all[index - 1] === '--ignore-pattern',
  )

describe('ignore forwarding', () => {
  it("rewrites the config's .lintignore for a working directory below it", () => {
    const root = mkdtempSync(path.join(scratch, 'esclint-forward-'))
    writeFileSync(
      path.join(root, '.lintignore'),
      'packages/b/generated/\n/lib\ndist-*/\n*.log\npackages/*/tmp/\n**/cache/\n',
    )
    const below = forwarded(path.join(root, 'packages/b'), root)
    expect(below).toEqual(expect.arrayContaining(['/generated/', 'dist-*/', '*.log', '**/cache/']))
    expect(below.filter((pattern) => pattern.includes('packages/') || pattern === '/lib')).toEqual(
      [],
    )
    expect(forwarded(root, root)).toEqual(
      expect.arrayContaining(['packages/b/generated/', '/lib', 'packages/*/tmp/']),
    )
  })

  it('prunes everything when the config ignores the working directory, never more', () => {
    const root = mkdtempSync(path.join(scratch, 'esclint-forward-'))
    writeFileSync(path.join(root, '.lintignore'), 'fixtures/\napp/[slug]/generated/\n')
    expect(forwarded(path.join(root, 'test/fixtures'), root)).toContain('**')
    // `[slug]` is a character class to the config, so the literal folder is not ignored
    expect(forwarded(path.join(root, 'app/[slug]'), root)).not.toContain('/generated/')
    expect(forwarded(path.join(root, 'app/[slug]'), root)).not.toContain('**')

    writeFileSync(path.join(root, '.lintignore'), 'fixtures/\n!fixtures/keep.ts\n')
    expect(forwarded(path.join(root, 'test/fixtures'), root)).not.toContain('**')
  })
})

describe('path partition', () => {
  it('sends residual extensions to ESLint, script extensions to Oxlint, and directories to both', () => {
    const cwd = mkdtempSync(path.join(scratch, 'esclint-partition-'))
    mkdirSync(path.join(cwd, 'pkg.v2'))
    mkdirSync(path.join(cwd, 'src'))

    expect(
      partitionPaths(cwd, [
        'a.yaml',
        'a.ts',
        'a.vue',
        'tsconfig.json',
        'src',
        'pkg.v2',
        'Makefile',
      ]),
    ).toEqual({
      oxlint: ['a.ts', 'a.vue', 'src', 'pkg.v2'],
      residual: ['a.yaml', 'a.vue', 'tsconfig.json', 'src', 'pkg.v2'],
    })
  })

  it('sends Svelte files to Oxlint, Astro files to both, and files Git ignores to neither', () => {
    const cwd = mkdtempSync(path.join(scratch, 'esclint-partition-git-'))
    const variables = spawnSync('git', ['rev-parse', '--local-env-vars'], { encoding: 'utf8' })
    expect(variables.status, variables.stderr).toBe(0)

    // Hooks export GIT_DIR and other repository state; git init must not modify the caller's repo.
    try {
      for (const name of variables.stdout.trim().split('\n')) {
        vi.stubEnv(name, undefined)
      }
      const initialized = spawnSync('git', ['init', '--quiet'], { cwd, encoding: 'utf8' })
      expect(initialized.status, initialized.stderr).toBe(0)
      writeFileSync(path.join(cwd, '.gitignore'), 'generated/\n')

      expect(
        partitionPaths(cwd, ['a.svelte', 'b.astro', 'generated/c.ts', 'generated/c.yaml', 'd.ts']),
      ).toEqual({ oxlint: ['a.svelte', 'b.astro', 'd.ts'], residual: ['b.astro'] })
    } finally {
      vi.unstubAllEnvs()
    }
  })
})

describe('hints', () => {
  it('reacts to the diagnostic code, not to a file named after it', () => {
    expect(hintFor('  x typescript(tsconfig-error): Invalid option')).toContain('TypeScript 7')
    expect(hintFor('src/tsconfig-error.ts:1:1: Unexpected var')).toBeUndefined()
    expect(hintFor('Failed to find tsgolint')).toContain('oxlint-tsgolint')
  })
})

describe('renderers', () => {
  const diagnostic = {
    code: toOxlintCode('yaml/sort-keys'),
    column: 1,
    endColumn: 2,
    endLine: 1,
    filename: '/project/config.yaml',
    help: undefined,
    length: undefined,
    line: 1,
    message: 'Expected keys to be sorted.',
    offset: undefined,
    severity: 'error' as const,
  }

  it('uses the plugin(rule) spelling everywhere', () => {
    expect(diagnostic.code).toBe('yaml(sort-keys)')
    expect(toOxlintCode('no-unused-vars')).toBe('eslint(no-unused-vars)')
    expect(toOxlintCode(null)).toBeUndefined()
  })

  it('renders the three line formats relative to the working directory', () => {
    expect(renderStylish('/project', [diagnostic])).toBe(
      '\nconfig.yaml\n  1:1      error    Expected keys to be sorted.  yaml(sort-keys)\n',
    )
    expect(renderGithub('/project', [diagnostic])).toBe(
      '::error file=config.yaml,line=1,endLine=1,col=1,endColumn=2,title=yaml(sort-keys)::config.yaml:1:1: Expected keys to be sorted.\n',
    )
    expect(renderUnix('/project', [diagnostic])).toBe(
      'config.yaml:1:1: Expected keys to be sorted. [Error/yaml(sort-keys)]\n',
    )
    expect(renderStylish('/project', [])).toBe('')
  })

  it('escapes GitHub annotations, so commas and line breaks cannot split them', () => {
    expect(
      renderGithub('/project', [
        { ...diagnostic, filename: '/project/a,b.yaml', message: 'Key\nwith 100%' },
      ]),
    ).toBe(
      '::error file=a%2Cb.yaml,line=1,endLine=1,col=1,endColumn=2,title=yaml(sort-keys)::a,b.yaml:1:1: Key%0Awith 100%25\n',
    )
  })

  it('colours stylish output in the Oxlint palette only when asked', () => {
    expect(renderStylish('/project', [diagnostic], true)).toBe(
      '\n\u001B[4mconfig.yaml\u001B[24m\n  \u001B[2m1:1\u001B[22m      \u001B[31merror\u001B[39m    Expected keys to be sorted.  \u001B[2myaml(sort-keys)\u001B[22m\n',
    )
    expect(
      renderStylish('/project', [{ ...diagnostic, code: undefined, severity: 'warning' }]),
    ).toBe('\nconfig.yaml\n  1:1      warning  Expected keys to be sorted.\n')
  })
})
