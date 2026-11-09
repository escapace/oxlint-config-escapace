/**
 * GitHub YAML sort orders are semantic first and documentation-shaped second.
 * Keep related meaning in this order: identity and display metadata, external
 * contract, authority and execution context, lifecycle controls, then the
 * implementation body. This is why context keys such as `env`, `secrets`,
 * `shell`, and `working-directory` stay before `uses` or `run`, even when
 * GitHub examples often introduce the executable field earlier.
 *
 * Do not collapse workflow, reusable-workflow, composite-action, JavaScript
 * action, and Docker-action entries into one literal order. They should rhyme
 * semantically, while still reflecting the fields each GitHub shape supports.
 * Hyphenated job and input identifiers are parsed by eslint-plugin-yml as
 * bracket path segments, so path patterns need to support both dotted and
 * bracket notation.
 */
import type { RuleYamlSortKeysOptions } from '../rules/yaml.ts'
import { yamlSortKeysOptions } from '../rules/yaml.ts'

type ValueOf<T> = T extends Array<infer U> ? U : never

/** One `pathPattern` entry of `yaml/sort-keys`. */
type PathOption = Extract<ValueOf<RuleYamlSortKeysOptions>, { pathPattern: string }>

const sortKeysOption = (option: PathOption): PathOption => option

// the generic fallback's entries, which are all path-pattern options
const fallbackOptions = yamlSortKeysOptions.filter(
  (option): option is PathOption => typeof option === 'object' && 'pathPattern' in option,
)

const githubPathSegment = String.raw`(?:\.[a-zA-Z_][a-zA-Z0-9_]*|\["[a-zA-Z_][a-zA-Z0-9_-]*"\])`
const workflowJobPathPattern = `^jobs${githubPathSegment}$`
const workflowStepPathPattern = `^jobs${githubPathSegment}\\.steps\\[[0-9]+\\]$`
const workflowInputPathSegment = String.raw`(?:\.[a-zA-Z_][a-zA-Z0-9_]*|\["[a-zA-Z_][a-zA-Z0-9_-]*"\])`
const actionStepPathPattern = String.raw`^runs\.steps\[[0-9]+\]$`
const actionInputPathPattern = `^inputs${workflowInputPathSegment}$`
const actionOutputPathPattern = `^outputs${workflowInputPathSegment}$`

const githubWorkflowStepSortKeysOrder = [
  'name',
  'if',
  'id',
  'working-directory',
  'shell',
  'env',
  'continue-on-error',
  'timeout-minutes',
  'uses',
  'with',
  'run',
]

const githubWorkflowJobSortKeysOrder = [
  'name',
  'if',
  'needs',
  'runs-on',
  'permissions',
  'environment',
  'timeout-minutes',
  'defaults',
  'env',
  'secrets',
  'concurrency',
  'strategy',
  'continue-on-error',
  'outputs',
  'services',
  'container',
  'uses',
  'with',
  'steps',
]

const githubCompositeActionStepSortKeysOrder = [
  'name',
  'if',
  'id',
  'working-directory',
  'shell',
  'env',
  'continue-on-error',
  'uses',
  'with',
  'run',
]

export const ruleYamlSortKeysOptionsGithubWorkflows: RuleYamlSortKeysOptions = [
  sortKeysOption({
    allowLineSeparatedGroups: true,
    order: ['name', 'run-name', 'on', 'permissions', 'env', 'defaults', 'concurrency', 'jobs'],
    pathPattern: '^$',
  }),
  sortKeysOption({
    order: ['inputs', 'outputs', 'secrets'],
    pathPattern: String.raw`^on\.workflow_call$`,
  }),
  sortKeysOption({
    order: ['description', 'default', 'required', 'type'],
    pathPattern: `^on\\.workflow_call\\.inputs${workflowInputPathSegment}$`,
  }),
  sortKeysOption({
    order: ['description', 'default', 'required', 'type', 'options'],
    pathPattern: `^on\\.workflow_dispatch\\.inputs${workflowInputPathSegment}$`,
  }),
  sortKeysOption({
    order: ['description', 'value'],
    pathPattern: `^on\\.workflow_call\\.outputs${workflowInputPathSegment}$`,
  }),
  sortKeysOption({
    order: ['description', 'required'],
    pathPattern: `^on\\.workflow_call\\.secrets${workflowInputPathSegment}$`,
  }),
  ...[['run'], ['uses']].map((hasProperties) =>
    sortKeysOption({
      hasProperties,
      order: githubWorkflowStepSortKeysOrder,
      pathPattern: workflowStepPathPattern,
    }),
  ),
  ...[['steps'], ['uses'], ['container'], ['services']].map((hasProperties) =>
    sortKeysOption({
      hasProperties,
      order: githubWorkflowJobSortKeysOrder,
      pathPattern: workflowJobPathPattern,
    }),
  ),
  // the matrix's variables stay as written: GitHub orders the jobs, and names them in
  // `test (ubuntu-latest, 22)` form, by their order, and required checks use those names
  sortKeysOption({
    order: { type: 'ignore' },
    pathPattern: `^jobs${githubPathSegment}\\.strategy\\.matrix$`,
  }),
  ...fallbackOptions,
]

export const ruleYamlSortKeysOptionsGithubActions: RuleYamlSortKeysOptions = [
  sortKeysOption({
    allowLineSeparatedGroups: true,
    order: ['name', 'description', 'author', 'branding', 'inputs', 'outputs', 'runs'],
    pathPattern: '^$',
  }),
  sortKeysOption({
    order: ['description', 'default', 'required', 'deprecationMessage'],
    pathPattern: actionInputPathPattern,
  }),
  sortKeysOption({
    order: ['description', 'value'],
    pathPattern: actionOutputPathPattern,
  }),
  sortKeysOption({
    hasProperties: ['steps'],
    order: ['using', 'steps'],
    pathPattern: '^runs$',
  }),
  sortKeysOption({
    hasProperties: ['main'],
    order: ['using', 'pre', 'pre-if', 'main', 'post', 'post-if'],
    pathPattern: '^runs$',
  }),
  sortKeysOption({
    hasProperties: ['image'],
    order: [
      'using',
      'image',
      'env',
      'pre-entrypoint',
      'pre-if',
      'entrypoint',
      'args',
      'post-entrypoint',
      'post-if',
    ],
    pathPattern: '^runs$',
  }),
  ...[['run'], ['uses']].map((hasProperties) =>
    sortKeysOption({
      hasProperties,
      order: githubCompositeActionStepSortKeysOrder,
      pathPattern: actionStepPathPattern,
    }),
  ),
  ...fallbackOptions,
]
