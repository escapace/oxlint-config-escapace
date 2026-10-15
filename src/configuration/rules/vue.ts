import type { RuleTableInput } from '../types.ts'

export const rulesVueIncluded: RuleTableInput = {
  'vue/attribute-hyphenation': ['error', 'always'],
  'vue/block-order': ['error', { order: [['script', 'template'], 'style'] }],
  'vue/comma-dangle': [
    'warn',
    {
      arrays: 'always-multiline',
      exports: 'always-multiline',
      functions: 'always-multiline',
      imports: 'always-multiline',
      objects: 'always-multiline',
    },
  ],
  'vue/component-definition-name-casing': ['error', 'PascalCase'],
  'vue/component-name-in-template-casing': [
    'error',
    'PascalCase',
    { ignores: [], registeredComponentsOnly: true },
  ],
  'vue/component-options-name-casing': ['error', 'PascalCase'],
  'vue/custom-event-name-casing': ['error', 'kebab-case'],
  'vue/define-macros-order': [
    'error',
    { order: ['defineOptions', 'defineProps', 'defineEmits', 'defineSlots'] },
  ],
  'vue/define-props-destructuring': 'error',
  'vue/enforce-style-attribute': ['error', { allow: ['scoped', 'plain'] }],
  'vue/first-attribute-linebreak': 'off',
  'vue/match-component-file-name': ['error', { extensions: ['vue'], shouldMatchCase: false }],
  'vue/max-template-depth': ['error', { maxDepth: 8 }],
  // Vue exempts only the root `App` component; escapace writes the full word, in either file
  // name casing: `application.vue` imported as `Application` (`App` is an abbreviation)
  'vue/multi-word-component-names': [
    'error',
    { ignores: ['application', 'Application', 'layout', 'Layout'] },
  ],
  'vue/no-boolean-default': ['error', 'default-false'],
  'vue/no-empty-component-block': 'error',
  'vue/no-loss-of-precision': 'error',
  'vue/no-ref-object-reactivity-loss': 'error',
  'vue/no-required-prop-with-default': 'error',
  'vue/no-restricted-syntax': ['error', 'DebuggerStatement', 'LabeledStatement', 'WithStatement'],
  'vue/no-setup-props-reactivity-loss': 'error',
  'vue/no-sparse-arrays': 'error',
  'vue/no-unused-emit-declarations': 'error',
  'vue/no-unused-properties': ['error', { groups: ['props', 'data', 'computed', 'methods'] }],
  'vue/no-unused-refs': 'error',
  'vue/no-useless-v-bind': 'error',
  'vue/padding-line-between-blocks': ['warn', 'always'],
  'vue/prefer-use-template-ref': 'error',
  'vue/prop-name-casing': ['error', 'camelCase'],
  'vue/require-explicit-slots': 'warn',
  'vue/require-expose': 'warn',
}
