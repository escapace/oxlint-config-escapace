import { parseArgs } from 'node:util'
import eslintJs from '@eslint/js'
import typescriptEslint from '@typescript-eslint/eslint-plugin'
import prettier from 'eslint-config-prettier'
import { droppedRules } from '../src/capabilities/dropped.ts'
import { route } from '../src/routing/route.ts'
import { unwrapPlugin } from '../src/engines/eslint/unwrap.ts'
import {
  assertExclusionsCurrent,
  assertPeerFloorsCurrent,
  createCapabilities,
  readFeatures,
  readNativeRules,
  readOxlintSchema,
} from './codegen/capabilities.ts'
import { checkFiles, writeFiles } from './codegen/emit.ts'
import { generateFiles } from './codegen/generate.ts'
import { loadPlugins } from './codegen/plugin-modules.ts'
import { composeTables } from './codegen/presets.ts'
import { resolveConfiguration } from './codegen/resolve.ts'
import { knownRuleIds, validateReport } from './codegen/validate.ts'

const MANAGED = ['src/generated']

const { values } = parseArgs({ options: { check: { default: false, type: 'boolean' } } })

const nativeRules = readNativeRules()
const features = readFeatures()
assertExclusionsCurrent(features)
assertPeerFloorsCurrent(features)
const capabilities = createCapabilities(nativeRules, features)
const oxlintSchema = readOxlintSchema()

const loaded = await loadPlugins()
const known = knownRuleIds(capabilities, loaded)
const composed = composeTables({
  eslintRecommended: eslintJs.configs.recommended,
  plugins: loaded,
  prettier,
  typescriptEslint: unwrapPlugin(typescriptEslint),
  isKnown: (id) => known.has(id),
})
const configuration = resolveConfiguration(composed, (id) => known.has(id))
const result = route(configuration, capabilities)

const issues = validateReport(
  result.report,
  capabilities,
  loaded,
  new Set(Object.keys(droppedRules)),
  oxlintSchema,
)

if (issues.length > 0) {
  console.error('codegen: configuration problems')
  for (const issue of issues) {
    console.error(`  ${issue.id}: ${issue.message}`)
  }
  process.exit(1)
}

const files = await generateFiles(
  result,
  capabilities,
  nativeRules,
  features,
  configuration.tables,
  loaded,
  oxlintSchema,
)

if (values.check) {
  const problems = checkFiles(files, MANAGED)

  if (problems.length > 0) {
    console.error('codegen --check: generated files are out of date')
    for (const problem of problems) {
      console.error(`  ${problem}`)
    }
    process.exit(1)
  }

  console.log('codegen --check: up to date')
} else {
  writeFiles(files, MANAGED)
  console.log(`codegen: wrote ${files.length} files (Oxlint ${features.oxlintVersion})`)
}
