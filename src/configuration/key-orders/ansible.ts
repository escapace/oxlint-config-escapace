/**
 * Ansible YAML sort orders are semantic first, ansible-lint compatible second,
 * and documentation-shaped third. Plays flow from identity and target selection
 * to execution context, result controls, variables, selection, then the play
 * body.
 *
 * Task-like mappings intentionally differ: keep identity first, the module or
 * action body next, then execution context, result handling, conditions,
 * selection, notifications, and large nested bodies. ansible-lint enforces the
 * most important part of that shape: `name` first, and `block`, `rescue`, and
 * `always` last. Preserve that behavior because controls placed below a large
 * block are easy to confuse with nested task controls.
 *
 * Do not append the generic YAML sort fallback here. Module argument maps, role
 * variables, and many Molecule or metadata sub-maps are domain-specific and may
 * be intentionally grouped. Unknown task keys are treated as module/action keys
 * by default, so `ansibleTaskControlKeys` lists every task keyword of Ansible's
 * reference (docs.ansible.com, Playbook Keywords) plus `listen` for handlers;
 * any `with_<lookup>` is a loop keyword. Keywords missing from an order sit next
 * to their relatives; the orders mirror one another.
 */
import type { RuleYamlSortKeysOptions } from '../rules/yaml.ts'

type ValueOf<T> = T extends Array<infer U> ? U : never

/** One `pathPattern` entry of `yaml/sort-keys`. */
type PathOption = Extract<ValueOf<RuleYamlSortKeysOptions>, { pathPattern: string }>

const sortKeysOption = (option: PathOption): PathOption => option

const ansibleIdentifierPathSegment = String.raw`(?:\.[a-zA-Z_][a-zA-Z0-9_]*|\["[a-zA-Z_][a-zA-Z0-9_-]*"\])`
const ansibleRootSequenceItemPathPattern = String.raw`^\[[0-9]+\]$`
const ansibleNestedTaskPathPattern = String.raw`^\[[0-9]+\](?:\.(?:block|rescue|always)\[[0-9]+\])*$`
const ansiblePlayTaskPathPattern = String.raw`^\[[0-9]+\]\.(?:pre_tasks|tasks|post_tasks|handlers)\[[0-9]+\](?:\.(?:block|rescue|always)\[[0-9]+\])*$`
const ansiblePlayRolePathPattern = String.raw`^\[[0-9]+\]\.roles\[[0-9]+\]$`
const ansibleMetaDependencyPathPattern = String.raw`^dependencies\[[0-9]+\]$`
const ansibleRequirementPathPattern = String.raw`^(?:collections|roles)\[[0-9]+\]$`
const ansibleArgumentSpecPathPattern = `^argument_specs${ansibleIdentifierPathSegment}$`
const ansibleArgumentSpecOptionPathPattern = `^argument_specs${ansibleIdentifierPathSegment}\\.options(?:${ansibleIdentifierPathSegment}\\.options)*${ansibleIdentifierPathSegment}$`

const ansibleTaskControlKeys = [
  'action',
  'always',
  'any_errors_fatal',
  'args',
  'async',
  'become',
  'become_exe',
  'become_flags',
  'become_method',
  'become_user',
  'block',
  'changed_when',
  'check_mode',
  'collections',
  'connection',
  'debugger',
  'delay',
  'delegate_facts',
  'delegate_to',
  'diff',
  'environment',
  'failed_when',
  'ignore_errors',
  'ignore_unreachable',
  'listen',
  'local_action',
  'loop',
  'loop_control',
  'module_defaults',
  'name',
  'no_log',
  'notify',
  'poll',
  'port',
  'register',
  'remote_user',
  'rescue',
  'retries',
  'run_once',
  'tags',
  'throttle',
  'timeout',
  'until',
  'vars',
  'when',
  'with_dict',
  'with_fileglob',
  'with_first_found',
  'with_flattened',
  'with_indexed_items',
  'with_inventory_hostnames',
  'with_items',
  'with_lines',
  'with_list',
  'with_nested',
  'with_random_choice',
  'with_sequence',
  'with_subelements',
  'with_together',
]
// `with_` plus any lookup plugin name is a loop keyword
const ansibleTaskLoopKeyPattern = '^with_[a-z0-9_.]+$'
const ansibleTaskActionKeyPattern = `^(?!(?:${ansibleTaskControlKeys.join('|')})$)(?!with_).+$`

const ansibleTaskSortKeysOrder = [
  'name',
  'listen',
  'action',
  'local_action',
  { keyPattern: ansibleTaskActionKeyPattern },
  'args',
  'collections',
  'module_defaults',
  'become',
  'become_user',
  'become_method',
  'become_flags',
  'become_exe',
  'remote_user',
  'connection',
  'port',
  'delegate_to',
  'delegate_facts',
  'run_once',
  'throttle',
  'timeout',
  'environment',
  'vars',
  'register',
  'changed_when',
  'failed_when',
  'debugger',
  'check_mode',
  'diff',
  'no_log',
  'ignore_errors',
  'ignore_unreachable',
  'any_errors_fatal',
  'async',
  'poll',
  'until',
  'retries',
  'delay',
  'loop',
  'with_items',
  'with_list',
  'with_dict',
  'with_fileglob',
  'with_first_found',
  'with_flattened',
  'with_indexed_items',
  'with_inventory_hostnames',
  'with_lines',
  'with_nested',
  'with_random_choice',
  'with_sequence',
  'with_subelements',
  'with_together',
  { keyPattern: ansibleTaskLoopKeyPattern },
  'loop_control',
  'when',
  'tags',
  'notify',
  'block',
  'rescue',
  'always',
]

const ansiblePlaySortKeysOrder = [
  'name',
  'hosts',
  'gather_facts',
  'gather_subset',
  'gather_timeout',
  'fact_path',
  'become',
  'become_user',
  'become_method',
  'become_flags',
  'become_exe',
  'remote_user',
  'connection',
  'port',
  'strategy',
  'serial',
  'order',
  'run_once',
  'throttle',
  'timeout',
  'any_errors_fatal',
  'max_fail_percentage',
  'force_handlers',
  'debugger',
  'check_mode',
  'diff',
  'no_log',
  'ignore_errors',
  'ignore_unreachable',
  'vars',
  'vars_files',
  'vars_prompt',
  'validate_argspec',
  'collections',
  'module_defaults',
  'environment',
  'tags',
  'pre_tasks',
  'roles',
  'tasks',
  'post_tasks',
  'handlers',
]

const ansibleRoleUseSortKeysOrder = [
  'role',
  'name',
  'src',
  'version',
  'collections',
  'module_defaults',
  'become',
  'become_user',
  'become_method',
  'become_flags',
  'become_exe',
  'remote_user',
  'connection',
  'port',
  'delegate_to',
  'delegate_facts',
  'run_once',
  'throttle',
  'timeout',
  'environment',
  'vars',
  'debugger',
  'check_mode',
  'diff',
  'no_log',
  'ignore_errors',
  'ignore_unreachable',
  'any_errors_fatal',
  'when',
  'tags',
]

export const ruleYamlSortKeysOptionsAnsibleTasks: RuleYamlSortKeysOptions = [
  sortKeysOption({
    order: ansibleTaskSortKeysOrder,
    pathPattern: ansibleNestedTaskPathPattern,
  }),
]

export const ruleYamlSortKeysOptionsAnsiblePlaybooks: RuleYamlSortKeysOptions = [
  sortKeysOption({
    order: ansiblePlaySortKeysOrder,
    pathPattern: ansibleRootSequenceItemPathPattern,
  }),
  sortKeysOption({
    order: ansibleTaskSortKeysOrder,
    pathPattern: ansiblePlayTaskPathPattern,
  }),
  sortKeysOption({
    order: ansibleRoleUseSortKeysOrder,
    pathPattern: ansiblePlayRolePathPattern,
  }),
]

export const ruleYamlSortKeysOptionsAnsibleMeta: RuleYamlSortKeysOptions = [
  sortKeysOption({
    allowLineSeparatedGroups: true,
    order: ['galaxy_info', 'argument_specs', 'dependencies'],
    pathPattern: '^$',
  }),
  sortKeysOption({
    order: [
      'role_name',
      'namespace',
      'description',
      'author',
      'company',
      'issue_tracker_url',
      'license',
      'min_ansible_version',
      'platforms',
      'galaxy_tags',
      'dependencies',
    ],
    pathPattern: '^galaxy_info$',
  }),
  sortKeysOption({
    order: ['name', 'versions'],
    pathPattern: String.raw`^galaxy_info\.platforms\[[0-9]+\]$`,
  }),
  sortKeysOption({
    order: ansibleRoleUseSortKeysOrder,
    pathPattern: ansibleMetaDependencyPathPattern,
  }),
  sortKeysOption({
    order: ['short_description', 'description', 'author', 'version_added', 'options'],
    pathPattern: ansibleArgumentSpecPathPattern,
  }),
  sortKeysOption({
    order: [
      'description',
      'type',
      'required',
      'default',
      'choices',
      'elements',
      'options',
      'aliases',
      'version_added',
    ],
    pathPattern: ansibleArgumentSpecOptionPathPattern,
  }),
]

export const ruleYamlSortKeysOptionsAnsibleRequirements: RuleYamlSortKeysOptions = [
  sortKeysOption({
    allowLineSeparatedGroups: true,
    order: ['collections', 'roles'],
    pathPattern: '^$',
  }),
  sortKeysOption({
    order: ['name', 'src', 'source', 'type', 'scm', 'version', 'signatures'],
    pathPattern: ansibleRequirementPathPattern,
  }),
]

export const ruleYamlSortKeysOptionsMolecule: RuleYamlSortKeysOptions = [
  sortKeysOption({
    allowLineSeparatedGroups: true,
    order: [
      'scenario',
      'prerun',
      'role_name_check',
      'shared_state',
      'dependency',
      'driver',
      'platforms',
      'provisioner',
      'verifier',
      'lint',
    ],
    pathPattern: '^$',
  }),
  sortKeysOption({
    order: ['name', 'enabled', 'command', 'options', 'env'],
    pathPattern: '^dependency$',
  }),
  sortKeysOption({
    order: ['name', 'options'],
    pathPattern: '^driver$',
  }),
  sortKeysOption({
    order: [
      'name',
      'image',
      'pre_build_image',
      'dockerfile',
      'command',
      'override_command',
      'groups',
      'children',
      'privileged',
      'capabilities',
      'volumes',
      'tmpfs',
      'environment',
      'networks',
      'published_ports',
      'registry',
    ],
    pathPattern: String.raw`^platforms\[[0-9]+\]$`,
  }),
  sortKeysOption({
    order: ['name', 'playbooks', 'inventory', 'config_options', 'options', 'env', 'lint'],
    pathPattern: '^provisioner$',
  }),
  sortKeysOption({
    order: ['create', 'destroy', 'prepare', 'converge', 'side_effect', 'verify', 'cleanup'],
    pathPattern: String.raw`^provisioner\.playbooks$`,
  }),
]
