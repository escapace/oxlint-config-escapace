import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '..')

describe('codegen', () => {
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
