/*
 * Which engine a positional path belongs to. Extensions come
 * from the language definitions and the generated residual, so a language that
 * moves to Oxlint moves here too. Directories go to both engines.
 */
import { spawnSync } from 'node:child_process'
import { statSync } from 'node:fs'
import path from 'node:path'
import { extensionsOf, languages, oxlintLintsLanguage } from '../configuration/languages.ts'
import features from '../generated/capabilities/features.json' with { type: 'json' }
import { residualConfiguration } from '../generated/residual-configuration.ts'

const oxlintExtensions = new Set([
  ...extensionsOf(
    languages
      .filter((language) => oxlintLintsLanguage(language, features.languagePlugins))
      .flatMap((language) => language.files),
  ),
  // Oxlint lints its scripts when it walks a folder, so a named file must reach it too
  '.svelte',
])

export const residualExtensions = extensionsOf(
  residualConfiguration.languages.flatMap((language) => language.files),
)

const isDirectory = (cwd: string, file: string): boolean => {
  try {
    return statSync(path.resolve(cwd, file)).isDirectory()
  } catch {
    return false
  }
}

/**
 * The named files Git ignores. Oxlint lints a named file that Git ignores
 * while ESLint skips it, so neither gets it: a run over staged files lints what
 * a run over the folder would. Nothing is ignored outside a repository.
 */
const gitIgnored = (cwd: string, files: readonly string[]): Set<string> => {
  if (files.length === 0) {
    return new Set()
  }

  const result = spawnSync('git', ['check-ignore', '-z', '--stdin'], {
    cwd,
    encoding: 'utf8',
    input: files.join('\0'),
  })

  // exit 1: none ignored; 128: not a repository, or git is missing
  return result.status === 0
    ? new Set(result.stdout.split('\0').filter((file) => file !== ''))
    : new Set()
}

export interface Partition {
  oxlint: string[]
  residual: string[]
}

export const partitionPaths = (cwd: string, paths: readonly string[]): Partition => {
  const result: Partition = { oxlint: [], residual: [] }
  const directories = new Set(paths.filter((file) => isDirectory(cwd, file)))
  const ignored = gitIgnored(
    cwd,
    paths.filter((file) => !directories.has(file)),
  )

  for (const file of paths) {
    if (ignored.has(file)) {
      continue
    }

    const directory = directories.has(file)
    const extension = path.extname(file)

    if (directory || oxlintExtensions.has(extension)) {
      result.oxlint.push(file)
    }

    if (directory || residualExtensions.has(extension)) {
      result.residual.push(file)
    }
  }

  return result
}
