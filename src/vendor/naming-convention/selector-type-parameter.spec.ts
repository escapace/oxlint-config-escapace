/*! Ported from typescript-eslint v8.71.1 packages/eslint-plugin/tests/rules/naming-convention/cases/typeParameter.test.ts (MIT, see LICENSE). Cases for the `types` option are removed: it needs type information, which this copy rejects. */
import { createTestCases } from './create-test-cases.ts'

createTestCases([
  {
    code: [
      'class Ignored<%> {}',
      'function ignored<%>() {}',
      'type Ignored<%> = { ignored: % };',
      'interface Ignored<%> extends Ignored<string> {}',
    ],
    options: {
      selector: 'typeParameter',
    },
  },
])
