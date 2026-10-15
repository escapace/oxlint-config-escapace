/*
 * Modules the consumer's project provides because the bundle cannot carry
 * them: Astro's compiler ships a binary per platform. Each is resolved from
 * the linted file's folder, so every package of a workspace gets its own,
 * directly or through the framework package that depends on it.
 */
import { createRequire } from 'node:module'
import path from 'node:path'
import { satisfies } from 'semver'
import { isRecord } from '../../utilities/is-record.ts'
import { readJson } from '../../utilities/read-json.ts'

export interface ProjectModule {
  name: string
  /** The versions the bundled code that uses the module accepts. */
  range: string
  /** Packages that depend on the module, for projects that do not list it themselves. */
  via: readonly string[]
}

const resolved = new Map<string, unknown>()

/** The manifest path of `name` as seen from `directory`, if it resolves. */
const manifestFrom = (directory: string, name: string): string | undefined => {
  try {
    return createRequire(path.join(directory, 'package.json')).resolve(`${name}/package.json`)
  } catch {
    return undefined
  }
}

/** `module` as the project around `file` (the working directory without one) has it installed. */
export const requireFromProject = (module: ProjectModule, file: string | undefined): unknown => {
  const directory = file === undefined ? process.cwd() : path.dirname(path.resolve(file))
  const key = `${module.name}\0${directory}`

  if (resolved.has(key)) {
    return resolved.get(key)
  }

  // the project's own copy, else the one a dependent such as `astro` brings
  const base = [
    directory,
    ...module.via.flatMap((dependent) => {
      const found = manifestFrom(directory, dependent)

      return found === undefined ? [] : [path.dirname(found)]
    }),
  ].find((candidate) => manifestFrom(candidate, module.name) !== undefined)
  const manifest = base === undefined ? undefined : manifestFrom(base, module.name)
  const wanted = `${module.name}@'${module.range}'`

  if (base === undefined || manifest === undefined) {
    throw new Error(
      `${module.name} is not installed for ${directory}; add ${wanted} to the project's devDependencies`,
    )
  }

  const content = readJson(manifest)
  const version = isRecord(content) ? content.version : undefined

  if (typeof version !== 'string' || !satisfies(version, module.range)) {
    throw new Error(
      `${module.name} ${String(version)} is installed for ${directory}, but ${module.range} is needed; add ${wanted} to the project's devDependencies`,
    )
  }

  const loaded: unknown = createRequire(path.join(base, 'package.json'))(module.name)
  resolved.set(key, loaded)

  return loaded
}
