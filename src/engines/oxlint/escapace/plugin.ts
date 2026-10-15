/*
 * The `escapace` Oxlint plugin: the organisation's naming policy as two rules
 * under one name, since Oxlint reserves the `typescript` and `unicorn` plugin
 * names, and the rule that keeps disable comments in Oxlint's lane.
 *
 * - `naming-convention`: typescript-eslint's rule, vendored without TypeScript
 *   (src/vendor/naming-convention), so Oxlint never loads a type checker for it.
 * - `name-replacements`: unicorn's rule with the organisation's preset
 *   replacements; in files both engines read (`.vue`) it reports without
 *   fixing, because Oxlint cannot see template references and a rename would
 *   miss them.
 * - `no-eslint-directives`: `eslint-disable` comments where Oxlint reads only
 *   `oxlint-disable` ones.
 */
import path from 'node:path'
import type { ESLint, Rule } from 'eslint'
import { sharedLanguageByExtension } from '../../../configuration/languages.ts'
import namingConvention from '../../../vendor/naming-convention/index.ts'
import { inherit } from '../../../utilities/inherit.ts'
import { withPresetNameReplacements } from '../../../utilities/preset-name-replacements.ts'
import { noEslintDirectives } from './no-eslint-directives.ts'

const withoutTemplateFixes = (upstream: Rule.RuleModule): Rule.RuleModule => ({
  ...upstream,
  create(context) {
    if (!sharedLanguageByExtension.has(path.extname(context.filename))) {
      return upstream.create(context)
    }

    return upstream.create(
      inherit(context, {
        report: (descriptor: Rule.ReportDescriptor) => {
          const { fix: _fix, suggest: _suggest, ...rest } = descriptor
          context.report(rest)
        },
      }),
    )
  },
})

/** `nameReplacements` is unicorn's rule as ESLint sees it (already through unicorn's `toEslintRule`). */
export const createEscapacePlugin = (nameReplacements: Rule.RuleModule): ESLint.Plugin => {
  const replacements = withPresetNameReplacements({
    rules: { 'name-replacements': nameReplacements },
  }).rules?.['name-replacements']

  if (replacements === undefined) {
    throw new Error('eslint-plugin-unicorn does not provide name-replacements')
  }

  return {
    meta: { name: 'escapace' },
    rules: {
      'name-replacements': withoutTemplateFixes(replacements),
      // typescript-eslint types the context with ESLint 8 members (`parserOptions`, `getAncestors`, …)
      // that ESLint 10's lacks; the rule reads none of them, so only the declarations disagree
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      'naming-convention': namingConvention as unknown as Rule.RuleModule,
      'no-eslint-directives': noEslintDirectives,
    },
  }
}
