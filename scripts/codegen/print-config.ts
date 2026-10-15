/*
 * Validates the generated Oxlint configuration with the installed binary and
 * the bundled plugin shims: every rule name, option shape and plugin alias must
 * be accepted. Runs from the build, after rolldown, because the shims import
 * plugin internals that only the bundle can resolve.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { OxlintConfiguration } from '../../src/generated/oxlint-configuration.ts'
import { isRecord } from '../../src/utilities/is-record.ts'
import { oxlintBinary, rootDirectory } from './paths.ts'

const shim = (name: string): string => path.join(rootDirectory, 'lib/node/plugins', `${name}.js`)

export const validateWithOxlint = (configuration: OxlintConfiguration): void => {
  const directory = path.join(rootDirectory, '.cache/codegen')
  mkdirSync(directory, { recursive: true })
  const config = {
    categories: configuration.categories,
    jsPlugins: configuration.jsPlugins.map((plugin) => ({
      name: plugin.name,
      specifier: shim(plugin.shim),
    })),
    overrides: [
      ...configuration.overrides.map(({ name: _name, ...override }) => override),
      ...configuration.languages.flatMap((language) =>
        language.overrides.map(({ name: _name, ...override }) => override),
      ),
    ],
    plugins: configuration.plugins,
    rules: configuration.rules,
    settings: configuration.settings,
  }
  const file = path.join(directory, 'oxlint.config.ts')
  writeFileSync(file, `export default ${JSON.stringify(config, null, 2)}\n`)

  // A probe file makes Oxlint load every JS plugin, which `--print-config` alone does not.
  writeFileSync(path.join(directory, 'probe.ts'), 'export const probe = 1\n')

  const run = (arguments_: string[]): string => {
    try {
      return execFileSync(oxlintBinary, arguments_, {
        cwd: directory,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      // execFileSync's error carries the exit status and, with `encoding`, both outputs as strings
      const failure: Record<string, unknown> = isRecord(error) ? error : {}
      const text = [failure.stderr, failure.stdout]
        .map((output) => (typeof output === 'string' ? output : ''))
        .join('')

      // exit 1 with diagnostics only is a successful validation; a configuration failure says so
      if (failure.status === 1 && !/Failed to|not found|error:/i.test(text)) {
        return text
      }

      throw new Error(
        `oxlint rejected the generated configuration (${arguments_.join(' ')}):\n${text}`,
        {
          cause: error,
        },
      )
    }
  }

  run(['--print-config', '-c', file, '--no-error-on-unmatched-pattern'])
  run(['-c', file, '--no-error-on-unmatched-pattern', '--format', 'json', 'probe.ts'])
}
