/*
 * The bundle must work in a project that installs nothing but the engines:
 * every plugin, parser and TypeScript itself comes from lib/node. Engines are
 * linked from this repository; the package is copied, so a stray bare import
 * in the bundle cannot resolve through this repository's node_modules.
 */
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { jsonDiagnostics } from './json-output.ts'

// every temporary folder of this file lives here and goes when the file is done
const scratch = mkdtempSync(path.join(tmpdir(), 'esclint-bundle-spec-'))

afterAll(() => {
  rmSync(scratch, { force: true, recursive: true })
})

const root = path.resolve(import.meta.dirname, '..')

const OXLINT_FILE =
  "import { escapace } from 'oxlint-config-escapace'\n\nexport default escapace()\n"
const ESLINT_FILE =
  "import { escapace } from 'oxlint-config-escapace/eslint'\n\nexport default escapace()\n"

type Engine = 'eslint' | 'oxlint'

const createProject = (engines: readonly Engine[], files: Record<string, string>): string => {
  const directory = mkdtempSync(path.join(scratch, 'esclint-bundle-'))
  const modules = path.join(directory, 'node_modules')
  mkdirSync(path.join(modules, '.bin'), { recursive: true })

  const link = (name: string): void => {
    symlinkSync(
      realpathSync(path.join(root, 'node_modules', name)),
      path.join(modules, name),
      'dir',
    )
  }

  if (engines.includes('oxlint')) {
    link('oxlint')
    link('oxlint-tsgolint')
    const tsgolint = path.join(
      realpathSync(path.join(root, 'node_modules/oxlint-tsgolint')),
      'bin/tsgolint.js',
    )
    writeFileSync(
      path.join(modules, '.bin/tsgolint'),
      `#!/bin/sh\nexec node "${tsgolint}" "$@"\n`,
      {
        mode: 0o755,
      },
    )
    files['oxlint.config.ts'] = OXLINT_FILE
  }

  if (engines.includes('eslint')) {
    link('eslint')
    files['eslint.config.mjs'] = ESLINT_FILE
  }

  const target = path.join(modules, 'oxlint-config-escapace')
  cpSync(path.join(root, 'lib'), path.join(target, 'lib'), { recursive: true })
  cpSync(path.join(root, 'package.json'), path.join(target, 'package.json'))

  for (const [name, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(directory, name)), { recursive: true })
    writeFileSync(path.join(directory, name), content)
  }

  return directory
}

const run = (cwd: string, ...arguments_: string[]) =>
  spawnSync(
    process.execPath,
    [path.join(cwd, 'node_modules/oxlint-config-escapace/lib/node/esclint.js'), ...arguments_],
    { cwd, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } },
  )

const codes = (stdout: string): string[] =>
  jsonDiagnostics(stdout).map((diagnostic) => `${diagnostic.filename}:${diagnostic.code ?? ''}`)

const TSCONFIG = JSON.stringify({
  compilerOptions: {
    module: 'esnext',
    moduleResolution: 'bundler',
    noEmit: true,
    strict: true,
    target: 'es2024',
    types: [],
  },
  include: ['src'],
})

describe('bundle in an isolated project', { timeout: 120_000 }, () => {
  it('loads every Oxlint plugin shim and every residual group with only the engines installed', () => {
    const cwd = createProject(['oxlint', 'eslint'], {
      'config.toml': 'a=1\n',
      'config.yaml': 'zebra: 1\napple: 2\n',
      'data.json': '{ "b": 1, "a": 2 }\n',
      'package.json': JSON.stringify({
        dependencies: { vue: '3.5.0' },
        name: 'isolated',
        type: 'module',
      }),
      'src/App.vue':
        '<script setup lang="ts">\nconst items: any = [1]\n</script>\n\n<template>\n  <div v-for="item in items">{{ item }}</div>\n</template>\n',
      'src/index.ts':
        'export const repo = { b: 1, a: 2 }\n\nexport const read = async (value: Promise<number>): Promise<number> => {\n  const result: any = value\n\n  return result\n}\n\n// oxlint-disable-next-line escapace/naming-convention\nexport const Allowed_Name = 1\nexport const Bad_Name = 2\n',
      'tsconfig.json': TSCONFIG,
    })
    const result = run(cwd, '--format', 'json')

    expect(result.stderr).not.toMatch(/Failed to (load|parse)|Cannot find (module|package)/)
    expect(result.status).toBe(1)
    const seen = codes(result.stdout)
    expect(seen).toContain('src/index.ts:typescript(no-explicit-any)')
    expect(seen).toContain('src/index.ts:typescript(no-unsafe-return)')
    expect(seen).toContain('src/index.ts:perfectionist(sort-objects)')
    expect(seen).toContain('src/index.ts:escapace(name-replacements)')
    expect(
      seen.filter((entry) => entry === 'src/index.ts:escapace(naming-convention)'),
    ).toHaveLength(1)
    expect(seen).toContain('src/App.vue:vue(require-v-for-key)')
    expect(seen).toContain('config.yaml:yaml(sort-keys)')
    expect(seen).toContain('data.json:json(sort-keys)')
    expect(seen.some((entry) => entry.startsWith('config.toml:toml('))).toBe(true)
  })

  it('works with only oxlint installed', () => {
    const cwd = createProject(['oxlint'], {
      'package.json': JSON.stringify({ name: 'oxlint-only', type: 'module' }),
      'src/index.ts': 'export const value: any = 1\n',
      'tsconfig.json': TSCONFIG,
    })
    const result = run(cwd, '--format', 'json')

    expect(result.stderr).not.toMatch(/Failed to (load|parse)|Cannot find (module|package)/)
    expect(codes(result.stdout)).toContain('src/index.ts:typescript(no-explicit-any)')
  })

  it('works with only eslint installed', () => {
    const cwd = createProject(['eslint'], {
      'config.yaml': 'zebra: 1\napple: 2\n',
      'package.json': JSON.stringify({ name: 'eslint-only', type: 'module' }),
    })
    const result = run(cwd)

    expect(result.status).toBe(1)
    expect(result.stdout).toContain('yaml(sort-keys)')
    expect(result.stderr).not.toContain('skipped')
  })

  it('names the missing engine when a config file exists without it', () => {
    const cwd = createProject(['eslint'], {
      'oxlint.config.ts': OXLINT_FILE,
      'package.json': JSON.stringify({ name: 'missing-oxlint', type: 'module' }),
    })
    const result = run(cwd)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('`oxlint` is not installed')
  })
})
