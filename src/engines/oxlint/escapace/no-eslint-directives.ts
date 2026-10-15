/*
 * `escapace/no-eslint-directives`: Oxlint reads only `oxlint-disable`
 * comments (`respectEslintDisableDirectives: false`) and ESLint only
 * `eslint-disable` ones, so each engine keeps to its own. In the
 * files Oxlint lints, an `eslint-disable` comment does nothing: it is reported
 * and renamed. Both engines read the scripts of some languages (`.vue`), so
 * there only a comment whose rules are all Oxlint's is renamed; blanket
 * comments and those naming the ESLint side's rules are never touched, whether
 * or not ESLint lints the file, so the rule needs no knowledge of ESLint's
 * configs.
 */
import path from 'node:path'
import type { Rule } from 'eslint'
import { sharedLanguageByExtension } from '../../../configuration/languages.ts'
import { ruleIndex } from '../../../generated/rule-index.ts'
import { movedRuleKey } from '../../../utilities/normalize-rules.ts'
import { oxlintRunsIn } from '../../../utilities/rule-engines.ts'

// ESLint's directive grammar: a ` -- reason` is split off first, then the keyword, then
// comma-separated rule names, each optionally quoted
const REASON = /\s-{2,}\s/u
const DIRECTIVE = /^(\s*)eslint-(disable|disable-line|disable-next-line|enable)(?:\s|$)/u
const QUOTED = /^(["']?)(.*)\1$/su

const unquoted = (item: string): string => item.trim().replace(QUOTED, '$2')

const ruleNames = (list: string): string[] =>
  list
    .split(',')
    .map((item) => unquoted(item))
    .filter((name) => name !== '')

/** The name Oxlint knows a rule by: a rule that moved (`unicorn/prevent-abbreviations`) under its new id. */
const oxlintName = (name: string): string => {
  const moved = movedRuleKey(name)

  return moved === undefined ? name : (ruleIndex[moved]?.engineId ?? moved)
}

/** Each name in the list, unquoted and under its Oxlint name, keeping commas and spacing. */
const renamedList = (list: string): string =>
  list
    .split(',')
    .map((item) => {
      const name = unquoted(item)

      if (name === '') {
        return item
      }

      const start = item.indexOf(item.trim())

      return `${item.slice(0, start)}${oxlintName(name)}${item.slice(start + item.trim().length)}`
    })
    .join(',')

export const noEslintDirectives: Rule.RuleModule = {
  meta: {
    docs: {
      description:
        'Disable comments for the rules Oxlint runs must be oxlint-disable comments: Oxlint ignores eslint-disable ones',
    },
    fixable: 'code',
    messages: {
      rename:
        'Oxlint ignores eslint-{{kind}} comments, so this one disables nothing; use oxlint-{{kind}}.',
      split:
        'In a {{extension}} file ESLint reads only eslint- comments and Oxlint only oxlint- ones; move {{rules}} into an oxlint-{{kind}} comment of its own.',
      splitLine:
        'In a {{extension}} file ESLint reads only eslint- comments and Oxlint only oxlint- ones; end the line this comment disables with // oxlint-disable-line {{rules}} (an eslint-disable-line comment there becomes a /* */ comment before it).',
    },
    schema: [],
    type: 'problem',
  },
  create(context) {
    // both engines read the scripts of some languages: only comments that are Oxlint's alone are touched
    const extension = path.extname(context.filename)
    const shared = sharedLanguageByExtension.get(extension)
    const { text } = context.sourceCode

    return {
      Program(node) {
        for (const comment of context.sourceCode.getAllComments()) {
          const [directive = ''] = comment.value.split(REASON)
          const match = DIRECTIVE.exec(directive)

          if (match === null || comment.range === undefined) {
            continue
          }

          const [, indent = '', kind = ''] = match
          const head = indent.length + 'eslint-'.length + kind.length
          const rules = ruleNames(directive.slice(head))
          const owned =
            shared === undefined ? rules : rules.filter((rule) => oxlintRunsIn(shared.id, rule))
          const where =
            comment.loc === null || comment.loc === undefined ? { node } : { loc: comment.loc }

          // ESLint's in a shared file: a blanket comment, or one for the ESLint side's rules only
          if (shared !== undefined && owned.length === 0) {
            continue
          }

          if (owned.length < rules.length) {
            context.report({
              ...where,
              data: { extension, kind, rules: owned.join(', ') },
              messageId: kind.endsWith('line') ? 'splitLine' : 'split',
            })
            continue
          }

          // the value ends the comment, or comes before its `*/`; the opener may be `//`, `/*` or `<!--`
          const start = comment.range[1] - (comment.type === 'Block' ? 2 : 0) - comment.value.length
          const located = text.slice(start, start + comment.value.length) === comment.value

          context.report({
            ...where,
            data: { kind },
            messageId: 'rename',
            ...(located
              ? {
                  fix: (fixer: Rule.RuleFixer) =>
                    fixer.replaceTextRange(
                      [start + indent.length, start + directive.length],
                      `oxlint-${kind}${renamedList(directive.slice(head))}`,
                    ),
                }
              : {}),
          })
        }
      },
    }
  },
}
