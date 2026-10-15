/*
 * File groups that refine a language's rules. Each group is routed like the
 * language tables: its rules land in whichever engine owns them.
 */
import {
  ruleYamlSortKeysOptionsAnsibleMeta,
  ruleYamlSortKeysOptionsAnsiblePlaybooks,
  ruleYamlSortKeysOptionsAnsibleRequirements,
  ruleYamlSortKeysOptionsAnsibleTasks,
  ruleYamlSortKeysOptionsMolecule,
} from './key-orders/ansible.ts'
import {
  ruleYamlSortKeysOptionsGithubActions,
  ruleYamlSortKeysOptionsGithubWorkflows,
} from './key-orders/github.ts'
import type { NativePlugin } from '../capabilities/native-plugins.ts'
import type { LanguageId, RuleTableInput } from './types.ts'

export interface OverrideGroup {
  /** Oxlint `env` entries for the group (for example `vitest`). */
  files: string[]
  env?: Record<string, boolean>
  /** The language whose rules this group refines; decides how its rules are routed. */
  language: LanguageId
  name: string
  /** Native Oxlint plugins to enable only for this group (for example `vitest`). */
  nativePlugins?: NativePlugin[]
  /** Rules written here replace the language rules for matching files. */
  rules: RuleTableInput
  /** Marks the group whose rules come from the vitest tables (filled by codegen). */
  vitest?: boolean
}

const testFiles = [
  '**/__tests__/**/*.{js,cjs,mjs,jsx,ts,cts,mts,tsx}',
  '**/*.{test,spec}.{js,cjs,mjs,jsx,ts,cts,mts,tsx}',
]

export const overrideGroups: readonly OverrideGroup[] = [
  {
    // Declaration files describe shapes defined elsewhere: `export {}` is what makes
    // `declare global` legal (pilot, 2026-10-15)
    files: ['**/*.d.{ts,cts,mts}', '**/*.d.*.ts'],
    language: 'typescript',
    name: 'declarations',
    rules: { 'unicorn/require-module-specifiers': 'off' },
  },
  {
    // a `.cjs` file is CommonJS whatever package.json says: `require` is its module syntax
    // and `import` would be a syntax error
    files: ['**/*.cjs'],
    language: 'javascript',
    name: 'commonjs',
    rules: { 'typescript/no-require-imports': 'off' },
  },
  {
    env: { vitest: true },
    files: testFiles,
    language: 'typescript',
    name: 'tests',
    nativePlugins: ['vitest'],
    rules: {},
    vitest: true,
  },
  {
    files: ['**/{tasks,handlers}/**/*.{yml,yaml}'],
    language: 'yaml',
    name: 'ansible-tasks',
    rules: { 'yaml/sort-keys': ['error', ...ruleYamlSortKeysOptionsAnsibleTasks] },
  },
  {
    files: [
      '**/{playbooks,plays}/**/*.{yml,yaml}',
      '**/molecule/**/{cleanup,converge,create,destroy,prepare,side_effect,verify}.{yml,yaml}',
      '**/{playbook,site}.{yml,yaml}',
    ],
    language: 'yaml',
    name: 'ansible-playbooks',
    rules: { 'yaml/sort-keys': ['error', ...ruleYamlSortKeysOptionsAnsiblePlaybooks] },
  },
  {
    files: ['**/meta/{argument_specs,main}.{yml,yaml}'],
    language: 'yaml',
    name: 'ansible-meta',
    rules: { 'yaml/sort-keys': ['error', ...ruleYamlSortKeysOptionsAnsibleMeta] },
  },
  {
    files: ['**/requirements.{yml,yaml}'],
    language: 'yaml',
    name: 'ansible-requirements',
    rules: { 'yaml/sort-keys': ['error', ...ruleYamlSortKeysOptionsAnsibleRequirements] },
  },
  {
    files: ['**/molecule/**/molecule.{yml,yaml}'],
    language: 'yaml',
    name: 'molecule',
    rules: {
      // Molecule reads `molecule.yml` only under that name
      'yaml/file-extension': 'off',
      'yaml/sort-keys': ['error', ...ruleYamlSortKeysOptionsMolecule],
    },
  },
  {
    files: ['**/.github/workflows/**.{yml,yaml}'],
    language: 'yaml',
    name: 'github-workflows',
    rules: { 'yaml/sort-keys': ['error', ...ruleYamlSortKeysOptionsGithubWorkflows] },
  },
  {
    files: ['action.{yml,yaml}', '**/action.{yml,yaml}'],
    language: 'yaml',
    name: 'github-actions',
    rules: { 'yaml/sort-keys': ['error', ...ruleYamlSortKeysOptionsGithubActions] },
  },
  {
    files: ['**/package.json'],
    language: 'package-json',
    name: 'package-json',
    rules: { 'json/sort-keys': 'off' },
  },
]
