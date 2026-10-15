declare module 'eslint-plugin-vue/dist/rules/*.js' {
  import type { Rule } from 'eslint'

  const rule: Rule.RuleModule
  export default rule
}

declare module 'eslint-plugin-unicorn/rules/*.js' {
  import type { Rule } from 'eslint'

  const rule: Rule.RuleModule
  export default rule
}

declare module 'eslint-plugin-unicorn/rules/rule/to-eslint-rule.js' {
  import type { Rule } from 'eslint'

  const toEslintRule: (ruleId: string, rule: Rule.RuleModule) => Rule.RuleModule
  export default toEslintRule
}

declare module 'eslint-plugin-vue/dist/processor.js' {
  const processor: unknown
  export default processor
}
