/*
 * Runtime helpers both halves share: ignore files, framework detection, and the
 * routing of consumer-supplied rules through the generated rule index.
 */
import { type Dirent, existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ignore from 'ignore'
import { ignoreFiles, ignorePatterns as generatedIgnorePatterns } from '../configuration/ignores.ts'
import type { LanguageDefinition } from '../configuration/languages.ts'
import type { FrameworkLanguageOptions, Options } from '../configuration/options.ts'
import type {
  Engine,
  FrameworkLanguageId,
  OverrideInput,
  RuleEntry,
  RuleTable,
  RuleTableInput,
} from '../configuration/types.ts'
import { unavailableReason } from '../capabilities/plugins.ts'
import { ruleIndex, type RuleIndexEntry } from '../generated/rule-index.ts'
import { isRecord } from '../utilities/is-record.ts'
import { normalizeRuleKey } from '../utilities/normalize-rules.ts'
import { readJson } from '../utilities/read-json.ts'

export const readIgnoreFile = (file: string): string[] =>
  readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))

/** The `.lintignore` / `.eslintignore` files present in `directory`. */
export const ignoreFilesIn = (directory: string): string[] =>
  ignoreFiles.map((name) => path.join(directory, name)).filter((file) => existsSync(file))

/**
 * Generated ignores, the ignore files in `directory`, the checkouts nested in
 * it (`checkoutPatterns`), then the consumer's own patterns.
 */
export const collectIgnorePatterns = (
  directory: string,
  extra: readonly string[] = [],
): string[] => {
  const fromFiles = ignoreFilesIn(directory).flatMap((file) => readIgnoreFile(file))

  return [
    ...new Set([
      ...generatedIgnorePatterns,
      ...fromFiles,
      ...checkoutPatterns(directory),
      ...extra,
    ]),
  ]
}

// Oxlint also loads `.oxlintrc.json(c)`; such a file above a config makes that config nested
const CONFIG_FILE = {
  eslint: /^eslint\.config\.[cm]?[jt]s$/,
  oxlint: /^(?:oxlint\.config\.[cm]?[jt]s|\.oxlintrc\.jsonc?)$/,
} as const

/** Directory entries, or none when the directory cannot be listed (entered but not read: 0711). */
const listable = (directory: string): string[] => {
  try {
    return readdirSync(directory)
  } catch {
    return []
  }
}

const upwards = (directory: string, matches: (name: string) => boolean): string | undefined => {
  let current = path.resolve(directory)

  for (;;) {
    if (listable(current).some((name) => matches(name))) {
      return current
    }

    const parent = path.dirname(current)

    if (parent === current) {
      return undefined
    }

    current = parent
  }
}

/** File names (paths or file URLs) of the current call stack, read from V8 call sites, not parsed text. */
const stackFiles = (): string[] => {
  // the hook is saved as a descriptor and restored exactly, absent or not
  const prepare = Object.getOwnPropertyDescriptor(Error, 'prepareStackTrace')
  const limit = Error.stackTraceLimit
  const holder: { stack?: unknown } = {}

  try {
    Error.stackTraceLimit = 50
    Error.prepareStackTrace = (_error, sites) => sites.map((site) => site.getFileName() ?? '')
    Error.captureStackTrace(holder)

    return Array.isArray(holder.stack)
      ? holder.stack.filter((file): file is string => typeof file === 'string')
      : []
  } finally {
    if (prepare === undefined) {
      Reflect.deleteProperty(Error, 'prepareStackTrace')
    } else {
      Object.defineProperty(Error, 'prepareStackTrace', prepare)
    }

    Error.stackTraceLimit = limit
  }
}

const toPath = (file: string): string => {
  if (!file.startsWith('file:')) {
    return file
  }

  const url = new URL(file)
  url.search = ''

  return fileURLToPath(url)
}

const isConfigFile = (engine: Engine) => (name: string) => CONFIG_FILE[engine].test(name)

/**
 * The directory of the config file being evaluated, which is where its
 * `.lintignore` and `package.json` live: the calling config module on the
 * stack, else the nearest config file at or above the working directory.
 * Never the working directory alone, which may be a subdirectory.
 */
export const configurationDirectory = (engine: Engine): string => {
  for (const file of stackFiles()) {
    const location = toPath(file)

    if (isConfigFile(engine)(path.basename(location))) {
      return path.dirname(location)
    }
  }

  return upwards(process.cwd(), isConfigFile(engine)) ?? process.cwd()
}

/** Is `inner` at or below `outer`? */
const contains = (outer: string, inner: string): boolean => {
  const relative = path.relative(path.resolve(outer), path.resolve(inner))

  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

/** The config file in `directory` for `engine`, if any. */
const configFileIn = (engine: Engine, directory: string): string | undefined => {
  const name = listable(directory).find((entry) => isConfigFile(engine)(entry))

  return name === undefined ? undefined : path.join(directory, name)
}

const toPosix = (relative: string): string => relative.split(path.sep).join('/')

/** Ignore-file matching as Oxlint's walk does it: case-sensitive. */
const matcher = (patterns: readonly string[]): ignore.Ignore =>
  ignore({ ignorecase: false }).add([...patterns])

/**
 * Files inside the folder under test: all of them are ignored when the folder
 * is (`dir/`) or everything in it is (`dir/**`, `*`), but not when patterns
 * cover only some files (`dir/*.ts`, or `*` with `!*.*` re-including).
 */
const PROBES = ['esclint-probe', 'esclint-probe.js', 'esclint-probe.ts']

const insideIgnored = (test: (relative: string) => boolean, relative: string): boolean =>
  test(`${relative}/`) || PROBES.every((name) => test(`${relative}/${name}`))

/**
 * The git directory whose `info/exclude` Oxlint applies for the repository
 * rooted at `directory`: `.git` itself, or for a linked worktree the main
 * repository's (`commondir`); a submodule's is not applied (Oxlint 1.87).
 */
const gitDirectory = (directory: string): string | undefined => {
  const dotGit = path.join(directory, '.git')

  try {
    if (statSync(dotGit).isDirectory()) {
      return dotGit
    }

    const gitdir = /^gitdir: (.+)$/m.exec(readFileSync(dotGit, 'utf8'))?.[1]?.trim()

    if (gitdir === undefined) {
      return undefined
    }

    const resolved = path.resolve(directory, gitdir)

    return path.resolve(resolved, readFileSync(path.join(resolved, 'commondir'), 'utf8').trim())
  } catch {
    return undefined
  }
}

const isRepository = (directory: string): boolean => existsSync(path.join(directory, '.git'))

/** The root of the Git checkout `directory` is in: the nearest folder at or above it with a `.git`. */
const checkoutRoot = (directory: string): string | undefined => {
  let current = path.resolve(directory)

  while (!isRepository(current)) {
    const parent = path.dirname(current)

    if (parent === current) {
      return undefined
    }

    current = parent
  }

  return current
}

/**
 * The linked worktrees and submodules checked out below `directory`, relative
 * to it, as Git records them (`worktrees/*\/gitdir`, `.gitmodules`), so no
 * walk is needed. Each is a project of its own, another copy of a repository
 * that the enclosing project must not lint (agent tools put worktrees inside
 * the checkout, in `.claude/worktrees/` or `.worktrees/`).
 */
const nestedCheckouts = (directory: string): string[] => {
  const root = checkoutRoot(directory)

  if (root === undefined) {
    return []
  }

  const found: string[] = []
  const gitdir = gitDirectory(root)

  if (gitdir !== undefined) {
    for (const name of listable(path.join(gitdir, 'worktrees'))) {
      try {
        const dotGit = readFileSync(path.join(gitdir, 'worktrees', name, 'gitdir'), 'utf8').trim()
        found.push(path.dirname(path.resolve(gitdir, 'worktrees', name, dotGit)))
      } catch {
        // a worktree Git is about to prune
      }
    }
  }

  try {
    for (const match of readFileSync(path.join(root, '.gitmodules'), 'utf8').matchAll(
      /^[\t ]*path[\t ]*=([^\n]*)$/gm,
    )) {
      found.push(path.join(root, (match[1] ?? '').trim()))
    }
  } catch {
    // no submodules
  }

  const resolved = path.resolve(directory)

  return found
    .filter((checkout) => path.resolve(checkout) !== resolved && contains(resolved, checkout))
    .map((checkout) => toPosix(path.relative(resolved, checkout)))
}

/** The checkouts nested in `directory` as `.gitignore` patterns anchored there. */
export const checkoutPatterns = (directory: string): string[] =>
  nestedCheckouts(directory).map((checkout) => `/${escapeGitignore(checkout)}/`)

/** A literal path as a `.gitignore` pattern. */
const escapeGitignore = (value: string): string => value.replaceAll(/[!#*?[\\\]]/g, String.raw`\$&`)

interface GitScope {
  base: string
  patterns: string[]
}

const scopeIn = (folder: string, repositoryRoot: boolean): GitScope | undefined => {
  const gitdir = repositoryRoot ? gitDirectory(folder) : undefined
  const patterns = [
    ...(gitdir === undefined ? [] : readable(path.join(gitdir, 'info/exclude'))),
    ...readable(path.join(folder, '.gitignore')),
  ]

  return patterns.length === 0 ? undefined : { base: folder, patterns }
}

/**
 * Git's verdict on `target`, a folder (`folder`) or a file, from `scopes`
 * (deepest first): the deepest scope with a pattern matching the path itself
 * decides. The folders between a scope and `target` were found not ignored
 * on the way down, so they are re-included in that scope's matcher, which
 * keeps a pattern for a parent (`x/*` for `x/y`) from deciding `x/y/z`.
 */
const decide = (scopes: readonly GitScope[], target: string, folder: boolean): boolean => {
  for (const scope of scopes) {
    if (scope.base !== target) {
      const between = path.relative(scope.base, path.dirname(target))
      const reincluded =
        between === ''
          ? []
          : between
              .split(path.sep)
              .map(
                (_segment, index, segments) =>
                  `!/${escapeGitignore(segments.slice(0, index + 1).join('/'))}/`,
              )
      const result = matcher([...scope.patterns, ...reincluded]).test(
        `${toPosix(path.relative(scope.base, target))}${folder ? '/' : ''}`,
      )

      if (result.ignored || result.unignored) {
        return result.ignored
      }
    }
  }

  return false
}

/**
 * Whether Git ignores `directory`, or everything in it, as Oxlint's walk does
 * (also when it starts inside the folder): from the enclosing repository root
 * down, each folder is decided by the deepest `.gitignore` (or the root's
 * `info/exclude`) with a pattern for it, and an excluded folder excludes
 * everything below it. A repository of its own is judged from outside only
 * as a folder; its contents follow its own ignore files. With `inside`, the
 * question is what Oxlint started in `directory` sees: for a repository, only
 * its own ignore files. Patterns that re-include single files are not seen.
 */
const gitIgnores = (directory: string, inside: boolean): boolean => {
  const own = isRepository(directory)

  if (!own || !inside) {
    let top = path.dirname(directory)

    while (!isRepository(top) && path.dirname(top) !== top) {
      top = path.dirname(top)
    }

    const scopes: GitScope[] = []
    const enter = (folder: string): void => {
      const scope = scopeIn(folder, folder === top)

      if (scope !== undefined) {
        scopes.unshift(scope)
      }
    }

    enter(top)

    let current = top

    for (const segment of path.relative(top, directory).split(path.sep)) {
      current = path.join(current, segment)

      if (decide(scopes, current, true)) {
        return true
      }

      if (current !== directory || !own) {
        enter(current)
      }
    }

    if (!own) {
      return PROBES.every((name) => decide(scopes, path.join(directory, name), false))
    }
  }

  const scope = scopeIn(directory, true)

  return (
    scope !== undefined &&
    PROBES.every((name) => decide([scope], path.join(directory, name), false))
  )
}

/** Whether the project of the config in `root` includes `directory` (see `reachingConfiguration`). */
const projectIncludes = (root: string, directory: string): boolean => {
  const resolved = path.resolve(directory)
  const relative = toPosix(path.relative(path.resolve(root), resolved))

  if (relative === '') {
    return true
  }

  const ignores = matcher(collectIgnorePatterns(root))

  return (
    !insideIgnored((candidate) => ignores.ignores(candidate), relative) &&
    !gitIgnores(resolved, false)
  )
}

export const reachingConfiguration = (engine: Engine, directory: string): string | undefined => {
  const resolved = path.resolve(directory)

  if (path.dirname(resolved) === resolved) {
    return undefined
  }

  const parent = upwards(path.dirname(resolved), isConfigFile(engine))

  if (parent === undefined) {
    return undefined
  }

  return projectIncludes(parent, resolved) ? configFileIn(engine, parent) : undefined
}

/**
 * Why a config in `directory` cannot be the root of a project, if it cannot:
 * another config's project includes the folder, or Git ignores the folder
 * without it being a repository of its own, so Oxlint lints nothing there
 * from the command line while an editor lints it.
 */
export const projectRootProblem = (directory: string, subject: string): string | undefined => {
  const resolved = path.resolve(directory)
  const parent = reachingConfiguration('oxlint', resolved)

  if (parent !== undefined) {
    const parentDirectory = path.dirname(parent)
    const own = toPosix(path.relative(parentDirectory, resolved))

    return `${own}/${subject} is inside the project of ${parent}, which lints this folder; an editor would make it a root while the command line nests it. Keep one config per project: move its settings into ${path.basename(parent)} as an override for '${escapeGlob(own)}/**' and delete it, or list ${own}/ in ${path.join(parentDirectory, '.lintignore')} if it is a separate project`
  }

  if (gitIgnores(resolved, true)) {
    return `${subject} in ${resolved} is in a folder whose files Git ignores; Oxlint lints none of them from the command line while an editor lints them. Stop ignoring the folder in .gitignore (use .lintignore to keep it out of the enclosing project), or make it a repository of its own`
  }

  return undefined
}

/** One Oxlint config per project: fails at load when `projectRootProblem` finds one. */
export const assertProjectRoot = (directory: string): void => {
  const problem = projectRootProblem(
    directory,
    path.basename(configFileIn('oxlint', directory) ?? fileFor('oxlint')),
  )

  if (problem !== undefined) {
    throw new ConfigurationError(problem)
  }
}

/** `-c path`, `-cpath`, `-c=path`, `--config path`, `--config=path`. */
const CONFIG_FLAG = /^(?:-c|--config(?:=|$))/

/**
 * Whether the config in `directory` is the one the engine treats as root,
 * which alone may carry root-only settings (Oxlint's `options`). The config is
 * evaluated inside the engine's process, so `process.argv` and
 * `process.cwd()` are the engine's own.
 */
export const isRootConfiguration = (engine: Engine, directory: string): boolean => {
  if (process.argv.some((argument) => CONFIG_FLAG.test(argument))) {
    return true
  }

  // The language server's folder is invisible from here, and editors root it at the nearest
  // config (nvim-lspconfig) or at the opened folder; a config no other config reaches is the
  // root either way, and one that is reached never loads (`assertProjectRoot`).
  if (process.argv.includes('--lsp')) {
    return reachingConfiguration(engine, directory) === undefined
  }

  // Oxlint's command line takes the nearest config at or above its working directory as root
  const root = upwards(process.cwd(), isConfigFile(engine))

  if (root === undefined) {
    // a config below the working directory without one above it is nested
    return contains(directory, process.cwd())
  }

  // nested only when strictly below the root config; a config elsewhere is its own root
  return path.resolve(root) === path.resolve(directory) || !contains(root, directory)
}

/**
 * A `.gitignore`-syntax pattern as a flat-config glob, relative to the config
 * directory; `prefix` is the ignore file's directory below it (`sub/`). Same
 * conversion as ESLint's `includeIgnoreFile`, plus the prefix that a nested
 * ignore file needs.
 */
export const gitignoreToGlob = (pattern: string, prefix = ''): string => {
  const negated = pattern.startsWith('!')
  const body = (negated ? pattern.slice(1) : pattern).trimEnd()
  const sign = negated ? '!' : ''

  if (['', '**', '**/', '/**'].includes(body)) {
    return `${sign}${prefix}${body}`
  }

  const slash = body.indexOf('/')
  const everywhere = slash === -1 || slash === body.length - 1 ? '**/' : ''
  const anchored = slash === 0 ? body.slice(1) : body
  const inside = body.endsWith('/**') ? '/*' : ''

  return `${sign}${prefix}${everywhere}${anchored}${inside}`
}

interface IgnoreScope {
  /** Directory of the ignore file, relative to the walk root, POSIX separators (`''` for the root). */
  base: string
  matcher: ignore.Ignore
}

const readable = (file: string): string[] => {
  try {
    return readIgnoreFile(file)
  } catch {
    return []
  }
}

// directory-only patterns (`build/`) need the trailing slash
const ignored = (scopes: readonly IgnoreScope[], relative: string): boolean =>
  scopes.some(({ base, matcher }) =>
    matcher.ignores(`${base === '' ? relative : path.posix.relative(base, relative)}/`),
  )

/**
 * The `.gitignore` files below `directory` (not the root one), as Oxlint
 * honours them: directories that `rootPatterns` or a `.gitignore` on the way
 * exclude are never entered, nor are symlinks, unreadable directories and `.git`.
 */
export const nestedGitignores = (directory: string, rootPatterns: readonly string[]): string[] => {
  const found: string[] = []

  const walk = (relative: string, scopes: readonly IgnoreScope[], depth: number): void => {
    let entries: Dirent[]

    try {
      entries = readdirSync(path.join(directory, relative), { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const child = relative === '' ? entry.name : `${relative}/${entry.name}`

      if (!entry.isDirectory() || entry.name === '.git' || ignored(scopes, child)) {
        continue
      }

      const file = path.join(directory, child, '.gitignore')
      const patterns = existsSync(file) ? readable(file) : []

      if (existsSync(file)) {
        found.push(file)
      }

      if (depth < 32) {
        walk(
          child,
          patterns.length === 0
            ? scopes
            : [...scopes, { base: child, matcher: ignore().add(patterns) }],
          depth + 1,
        )
      }
    }
  }

  walk('', [{ base: '', matcher: ignore().add([...rootPatterns]) }], 0)

  return found
}

/**
 * An ignore-file pattern of the config directory, relative to `below`, the
 * working directory's path inside it. Patterns without a directory part hold
 * at any depth; anchored ones under `below` lose that prefix and keep their
 * anchor; the rest (other folders, a wildcard in the prefix, a `below` whose
 * name a glob would read as a pattern, like `[slug]`) is dropped, which only
 * means less pruning.
 */
export const rebaseIgnorePattern = (pattern: string, below: string): string | undefined => {
  if (pattern.startsWith('!')) {
    const rebased = rebaseIgnorePattern(pattern.slice(1), below)

    return rebased === undefined ? undefined : `!${rebased}`
  }

  if (below === '' || pattern.startsWith('**/')) {
    return pattern
  }

  const body = pattern.replace(/^\//, '')

  if (!pattern.startsWith('/') && !body.replace(/\/$/, '').includes('/')) {
    return pattern
  }

  const prefix = `${below}/`

  if (/[!*?[\\\]{}]/.test(below) || !body.startsWith(prefix)) {
    return undefined
  }

  const rest = body.slice(prefix.length)

  return rest === '' ? '**' : `/${rest}`
}

/**
 * The ignore rules of the project above `directory`, rewritten relative to it.
 * A package's ESLint config lints only its folder, but the `.gitignore`,
 * `.lintignore` and `.eslintignore` files from the project root down still
 * apply there, as they do for Oxlint. Stops at the checkout root (or, outside
 * Git, the nearest Oxlint config above), and at a folder whose rules exclude
 * `directory`, which makes it a separate project.
 */
export const inheritedIgnorePatterns = (directory: string): string[] => {
  const resolved = path.resolve(directory)
  const top = checkoutRoot(resolved) ?? upwards(path.dirname(resolved), isConfigFile('oxlint'))

  if (top === undefined || top === resolved) {
    return []
  }

  const levels: string[][] = []

  for (
    let current = path.dirname(resolved);
    contains(top, current);
    current = path.dirname(current)
  ) {
    const below = toPosix(path.relative(current, resolved))
    const patterns = [...ignoreFilesIn(current), path.join(current, '.gitignore')]
      .filter((file) => existsSync(file))
      .flatMap((file) => readable(file))
    const ignores = matcher([...generatedIgnorePatterns, ...patterns])

    if (insideIgnored((candidate) => ignores.ignores(candidate), below)) {
      break
    }

    levels.unshift(
      patterns.flatMap((pattern) => {
        const rebased = rebaseIgnorePattern(pattern, below)

        return rebased === undefined ? [] : [rebased]
      }),
    )

    if (current === top) {
      break
    }
  }

  return levels.flat()
}

/** The patterns that apply at the root of `directory`: generated ones, the ignore files there, and `.gitignore`. */
export const rootIgnorePatterns = (directory: string, extra: readonly string[] = []): string[] => [
  ...generatedIgnorePatterns,
  ...checkoutPatterns(directory),
  ...extra,
  ...[...ignoreFilesIn(directory), path.join(directory, '.gitignore')]
    .filter((file) => existsSync(file))
    .flatMap((file) => readable(file)),
]

/** A path as a literal glob: `app/[slug]` must not read as a character class. */
export const escapeGlob = (value: string): string =>
  value.replaceAll(/[!()*+?@[\]{}]/g, String.raw`\$&`)

const readPackageJson = (directory: string): Record<string, unknown> | undefined => {
  let current = directory

  for (;;) {
    const file = path.join(current, 'package.json')

    if (existsSync(file)) {
      try {
        const manifest = readJson(file)

        return isRecord(manifest) ? manifest : undefined
      } catch {
        return undefined
      }
    }

    const parent = path.dirname(current)

    if (parent === current) {
      return undefined
    }

    current = parent
  }
}

const escapeRegExp = (text: string): string =>
  text.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`)

/**
 * Lockfile entries for a package itself, per package manager. A lockfile
 * records every workspace package's dependencies, transitive ones too (a Nuxt
 * project's vue), with or without a node_modules folder (Yarn Plug'n'Play,
 * Bun's isolated store).
 */
const lockfileEntries = (name: string): ReadonlyArray<[file: string, entry: RegExp]> => {
  const escaped = escapeRegExp(name)
  const installed = new RegExp(String.raw`"(?:[\w@./-]+\/)?node_modules\/${escaped}":`)

  return [
    ['pnpm-lock.yaml', new RegExp(String.raw`^ {2}'?${escaped}@\d`, 'm')],
    ['package-lock.json', installed],
    ['npm-shrinkwrap.json', installed],
    ['yarn.lock', new RegExp(`^"?${escaped}@`, 'm')],
    ['bun.lock', new RegExp(String.raw`\["${escaped}@\d`)],
  ]
}

const lockfileHas = (directory: string, name: string): boolean =>
  lockfileEntries(name).some(([file, entry]) => {
    try {
      return entry.test(readFileSync(path.join(directory, file), 'utf8'))
    } catch {
      return false
    }
  })

/** Whether a package manager's store in node_modules holds a package (pnpm, Bun's isolated installs). */
const storeHas = (directory: string, name: string): boolean =>
  ['.pnpm', '.bun'].some((store) => {
    try {
      // both stores spell a scope's slash as `+`
      const prefix = `${name.replace('/', '+')}@`

      return readdirSync(path.join(directory, 'node_modules', store)).some((entry) =>
        entry.startsWith(prefix),
      )
    } catch {
      return false
    }
  })

const dependsOn = (manifest: Record<string, unknown>, name: string): boolean =>
  ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'].some((field) => {
    const dependencies = manifest[field]

    return typeof dependencies === 'object' && dependencies !== null && name in dependencies
  })

/**
 * Whether a framework language (Vue, Astro) is on for the project at
 * `directory`: the option when given, else whether one of the language's
 * packages may appear anywhere in it: the nearest manifest depends on it, the
 * lockfile lists it, or it is installed (hoisted, or in a package manager's
 * store). One config serves the whole project, so a package's dependency
 * counts; the language's groups match only its own files, so a transitive
 * dependency changes nothing unless the project has some.
 */
export const detectLanguage = (
  directory: string,
  language: LanguageDefinition,
  enabled: boolean | undefined,
): boolean => {
  if (language.detect === undefined) {
    return true
  }

  if (enabled !== undefined) {
    return enabled
  }

  const manifest = readPackageJson(directory)

  return language.detect.packages.some(
    (name) =>
      (manifest !== undefined && dependsOn(manifest, name)) ||
      lockfileHas(directory, name) ||
      existsSync(path.join(directory, 'node_modules', name, 'package.json')) ||
      storeHas(directory, name),
  )
}

/** A framework language's options; a framework without an option field fails to compile here. */
export const frameworkOptions = (
  options: Pick<Options, FrameworkLanguageId>,
  language: LanguageDefinition,
): FrameworkLanguageOptions | undefined =>
  language.detect === undefined ? undefined : options[language.detect.id]

type Framework = NonNullable<LanguageDefinition['detect']>

export const frameworkName = (framework: Framework): string =>
  `${framework.id.slice(0, 1).toUpperCase()}${framework.id.slice(1)}`

/** The error for `what` (the `vue.rules` option, a rule) set while its framework language is off. */
export const frameworkOffError = (framework: Framework, what: string): ConfigurationError =>
  new ConfigurationError(
    `${what} is set but ${frameworkName(framework)} support is off: neither package.json, the lockfile nor node_modules next to the config shows ${framework.packages.join(' or ')}; set \`${framework.id}: { enabled: true }\``,
  )

const distance = (a: string, b: string): number => {
  const rows = Array.from({ length: a.length + 1 }, (_, index) => [index])

  for (let column = 1; column <= b.length; column += 1) {
    rows[0][column] = column
  }

  for (let row = 1; row <= a.length; row += 1) {
    for (let column = 1; column <= b.length; column += 1) {
      const cost = a[row - 1] === b[column - 1] ? 0 : 1
      rows[row][column] = Math.min(
        rows[row - 1][column] + 1,
        rows[row][column - 1] + 1,
        rows[row - 1][column - 1] + cost,
      )
    }
  }

  return rows[a.length][b.length]
}

const suggestions = (id: string): string[] => {
  const name = id.slice(id.indexOf('/') + 1)

  return Object.keys(ruleIndex)
    .map((candidate) => ({
      candidate,
      score: distance(candidate.slice(candidate.indexOf('/') + 1), name),
    }))
    .filter(({ score }) => score <= 3)
    .toSorted((a, b) => a.score - b.score)
    .slice(0, 3)
    .map(({ candidate }) => candidate)
}

export class ConfigurationError extends Error {
  override name = 'ConfigurationError'
}

const fileFor = (engine: Engine): string =>
  engine === 'oxlint' ? 'oxlint.config.ts' : 'eslint.config.mjs'

export interface RoutedRule {
  canonicalId: string
  engineId: string
  entry: RuleEntry
  index: RuleIndexEntry
}

const SEVERITIES: Record<string, 'error' | 'off' | 'warn'> = {
  0: 'off',
  1: 'warn',
  2: 'error',
  allow: 'off',
  deny: 'error',
  error: 'error',
  off: 'off',
  warn: 'warn',
}

/** A consumer's severity, as written: unlike the curated tables, no policy rewrites it. */
const consumerEntry = (rawId: string, value: unknown): RuleEntry => {
  const [level, ...options] = Array.isArray(value) ? (value as unknown[]) : [value]
  const severity = SEVERITIES[String(level)]

  if (severity === undefined) {
    throw new ConfigurationError(`Rule "${rawId}" has an invalid severity ${JSON.stringify(level)}`)
  }

  return Array.isArray(value) ? [severity, ...options] : severity
}

/** Looks a consumer-supplied rule up in the generated index; wrong engine and unknown ids throw. */
const routeConsumerRule = (rawId: string, value: unknown, engine: Engine): RoutedRule => {
  // the curated tables drop `react/*` from upstream presets; a consumer may still name a native react rule
  const canonicalId = normalizeRuleKey(rawId) ?? (rawId in ruleIndex ? rawId : undefined)

  if (canonicalId === undefined) {
    throw new ConfigurationError(
      `Rule "${rawId}" belongs to a plugin this package does not provide`,
    )
  }

  const entry = consumerEntry(rawId, value)
  const unavailable = unavailableReason(canonicalId)

  if (unavailable !== undefined) {
    throw new ConfigurationError(`Rule "${rawId}" is not available in this package: ${unavailable}`)
  }

  const index = ruleIndex[canonicalId]

  if (index === undefined) {
    const near = suggestions(canonicalId)
    const hint =
      near.length === 0
        ? ''
        : ` Did you mean ${near.map((candidate) => `"${candidate}"`).join(', ')}?`

    throw new ConfigurationError(`Unknown rule "${rawId}".${hint}`)
  }

  if (index.engine === engine) {
    return { canonicalId, engineId: index.engineId, entry, index }
  }

  if (index.secondary?.engine === engine) {
    return { canonicalId, engineId: index.secondary.engineId, entry, index }
  }

  const snippet = JSON.stringify({ rules: { [canonicalId]: entry } })

  throw new ConfigurationError(
    `Rule "${rawId}" is linted by ${index.engine === 'oxlint' ? 'Oxlint' : 'ESLint'} and belongs in ${fileFor(index.engine)}, not ${fileFor(engine)}. Move it there, for example: escapace(${snippet})`,
  )
}

export const routeConsumerRules = (
  rules: RuleTableInput | undefined,
  engine: Engine,
): RoutedRule[] =>
  Object.entries(rules ?? {})
    .filter(([, value]) => value !== undefined)
    .map(([id, value]) => routeConsumerRule(id, value, engine))

export const toEngineTable = (routed: readonly RoutedRule[]): RuleTable =>
  Object.fromEntries(routed.map((rule) => [rule.engineId, rule.entry]))

export interface RoutedOverride {
  files: string[]
  rules: RuleTable
  env?: Record<string, boolean>
  excludeFiles?: string[]
  globals?: Record<string, 'off' | 'readonly' | 'writable'>
}

export const routeConsumerOverrides = (
  overrides: readonly OverrideInput[] | undefined,
  engine: Engine,
): RoutedOverride[] =>
  (overrides ?? []).map((override) => ({
    ...(override.env === undefined ? {} : { env: override.env }),
    ...(override.excludeFiles === undefined ? {} : { excludeFiles: override.excludeFiles }),
    ...(override.globals === undefined ? {} : { globals: override.globals }),
    files: override.files,
    rules: toEngineTable(routeConsumerRules(override.rules, engine)),
  }))
