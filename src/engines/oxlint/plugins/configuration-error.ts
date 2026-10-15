/*
 * Bundled shim for the `esclint` plugin: one rule that reports a config error
 * on every file, so the language server shows why a config failed to load
 * instead of linting its files with another config.
 */
import type { ESLint } from 'eslint'

const shim: ESLint.Plugin = {
  meta: { name: 'esclint' },
  rules: {
    'configuration-error': {
      meta: { schema: [{ type: 'string' }], type: 'problem' },
      create(context) {
        const message = String(context.options[0])

        return {
          Program(node) {
            context.report({ loc: { column: 0, line: 1 }, message, node })
          },
        }
      },
    },
  },
}

export default shim
