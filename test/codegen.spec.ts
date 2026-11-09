import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '..')
const scratch = mkdtempSync(path.join(tmpdir(), 'esclint-codegen-spec-'))

afterAll(() => {
  rmSync(scratch, { force: true, recursive: true })
})

describe('codegen', () => {
  it('runs before the package has been built', () => {
    for (const name of [
      'scripts',
      'src',
      'package.json',
      'tsconfig.json',
      'oxlint.config.ts',
      'oxfmt.config.ts',
    ]) {
      cpSync(path.join(root, name), path.join(scratch, name), { recursive: true })
    }
    symlinkSync(
      realpathSync(path.join(root, 'node_modules')),
      path.join(scratch, 'node_modules'),
      'dir',
    )

    const result = spawnSync(
      path.join(scratch, 'node_modules/.bin/tsx'),
      ['scripts/codegen.ts', '--check'],
      { cwd: scratch, encoding: 'utf8' },
    )
    expect(result.stdout + result.stderr).toContain('codegen --check: up to date')
    expect(result.status).toBe(0)
  }, 120_000)

  it('generated files are up to date', () => {
    const result = spawnSync(
      path.join(root, 'node_modules/.bin/tsx'),
      ['scripts/codegen.ts', '--check'],
      { cwd: root, encoding: 'utf8' },
    )
    expect(result.stdout + result.stderr).toContain('codegen --check: up to date')
    expect(result.status).toBe(0)
  }, 120_000)
})
