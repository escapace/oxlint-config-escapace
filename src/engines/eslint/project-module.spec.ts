import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { requireFromProject } from './project-module.ts'

const scratch = mkdtempSync(path.join(tmpdir(), 'esclint-project-module-'))

afterAll(() => {
  rmSync(scratch, { force: true, recursive: true })
})

/** A package folder with a manifest and a CommonJS entry exporting `marker`. */
const install = (directory: string, name: string, version: string, marker: string): void => {
  mkdirSync(directory, { recursive: true })
  writeFileSync(
    path.join(directory, 'package.json'),
    JSON.stringify({ main: 'index.js', name, version }),
  )
  writeFileSync(path.join(directory, 'index.js'), `module.exports = { marker: '${marker}' }\n`)
}

const compiler = { name: 'fake-compiler', range: '^0.5.0', via: ['fake-framework'] }

describe('requireFromProject', () => {
  it("loads the project's own copy, else the one its framework package brings", () => {
    const own = path.join(scratch, 'own')
    install(path.join(own, 'node_modules/fake-compiler'), 'fake-compiler', '0.5.1', 'own')

    // the compiler is the framework's dependency, out of the project's own reach
    const transitive = path.join(scratch, 'transitive')
    install(
      path.join(transitive, 'node_modules/fake-framework'),
      'fake-framework',
      '7.0.0',
      'framework',
    )
    install(
      path.join(transitive, 'node_modules/fake-framework/node_modules/fake-compiler'),
      'fake-compiler',
      '0.5.2',
      'transitive',
    )

    expect(requireFromProject(compiler, path.join(own, 'src/a.astro'))).toEqual({ marker: 'own' })
    expect(requireFromProject(compiler, path.join(transitive, 'src/a.astro'))).toEqual({
      marker: 'transitive',
    })
  })

  it('names the package and the versions needed when it is missing or too old', () => {
    const missing = path.join(scratch, 'missing')
    mkdirSync(missing, { recursive: true })
    const old = path.join(scratch, 'old')
    install(path.join(old, 'node_modules/fake-compiler'), 'fake-compiler', '0.2.2', 'old')

    expect(() => requireFromProject(compiler, path.join(missing, 'a.astro'))).toThrow(
      'fake-compiler is not installed for',
    )
    expect(() => requireFromProject(compiler, path.join(old, 'a.astro'))).toThrow(
      'fake-compiler 0.2.2 is installed for',
    )
    expect(() => requireFromProject(compiler, path.join(old, 'a.astro'))).toThrow(
      "add fake-compiler@'^0.5.0' to the project's devDependencies",
    )
  })
})
