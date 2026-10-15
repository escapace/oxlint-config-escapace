/*
 * Each config file is the presence flag for its engine.
 */
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import type { ESLint } from 'eslint'
import type { globalIgnores, includeIgnoreFile } from 'eslint/config'
import { isRecord } from '../utilities/is-record.ts'
import { packageVersion } from '../utilities/read-json.ts'

const OXLINT_CONFIG_FILES = [
  'oxlint.config.ts',
  'oxlint.config.mts',
  '.oxlintrc.json',
  '.oxlintrc.jsonc',
]
const ESLINT_CONFIG_FILES = [
  'eslint.config.mjs',
  'eslint.config.js',
  'eslint.config.cjs',
  'eslint.config.ts',
  'eslint.config.mts',
  'eslint.config.cts',
]

const findUpwards = (directory: string, names: readonly string[]): string | undefined => {
  let current = path.resolve(directory)

  for (;;) {
    for (const name of names) {
      const candidate = path.join(current, name)

      if (existsSync(candidate)) {
        return candidate
      }
    }

    const parent = path.dirname(current)

    if (parent === current) {
      return undefined
    }

    current = parent
  }
}

export interface EnginePresence {
  eslintConfig: string | undefined
  oxlintConfig: string | undefined
}

export const detectPresence = (
  cwd: string,
  explicitConfig: string | undefined,
): EnginePresence => ({
  eslintConfig: findUpwards(cwd, ESLINT_CONFIG_FILES),
  oxlintConfig:
    explicitConfig === undefined
      ? findUpwards(cwd, OXLINT_CONFIG_FILES)
      : path.resolve(cwd, explicitConfig),
})

const projectRequire = (cwd: string): NodeJS.Require =>
  createRequire(path.join(cwd, '__esclint__.js'))

/** Resolves a package from the consumer's project, never from this package. */
export const resolveFromProject = (cwd: string, specifier: string): string | undefined => {
  try {
    return projectRequire(cwd).resolve(specifier)
  } catch {
    return undefined
  }
}

interface ProjectEslint {
  ESLint: typeof ESLint
}

interface ProjectEslintConfig {
  globalIgnores: typeof globalIgnores
  includeIgnoreFile: typeof includeIgnoreFile
}

const isProjectEslint = (exported: unknown): exported is ProjectEslint =>
  isRecord(exported) && typeof exported.ESLint === 'function'

const isProjectEslintConfig = (exported: unknown): exported is ProjectEslintConfig =>
  isRecord(exported) &&
  typeof exported.globalIgnores === 'function' &&
  typeof exported.includeIgnoreFile === 'function'

/** The consumer's `eslint` package, loaded from the project (check `resolveFromProject` first). */
export const loadProjectEslint = (cwd: string): ProjectEslint => {
  const exported: unknown = projectRequire(cwd)('eslint')

  if (!isProjectEslint(exported)) {
    throw new Error("the project's eslint package does not export ESLint")
  }

  return exported
}

/** The consumer's `eslint/config` helpers, loaded from the project. */
export const loadProjectEslintConfig = (cwd: string): ProjectEslintConfig => {
  const exported: unknown = projectRequire(cwd)('eslint/config')

  if (!isProjectEslintConfig(exported)) {
    throw new Error(
      "the project's eslint/config does not export globalIgnores and includeIgnoreFile",
    )
  }

  return exported
}

export const findOxlintBinary = (cwd: string): string | undefined => {
  const manifest = resolveFromProject(cwd, 'oxlint/package.json')

  if (manifest === undefined) {
    return undefined
  }

  const binary = path.join(path.dirname(manifest), 'bin/oxlint')

  return existsSync(binary) ? binary : undefined
}

export const installedVersion = (cwd: string, name: string): string | undefined => {
  const manifest = resolveFromProject(cwd, `${name}/package.json`)

  if (manifest === undefined) {
    return undefined
  }

  try {
    return packageVersion(manifest)
  } catch {
    return undefined
  }
}
