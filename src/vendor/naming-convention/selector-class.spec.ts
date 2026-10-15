/*! Ported from typescript-eslint v8.71.1 packages/eslint-plugin/tests/rules/naming-convention/cases/class.test.ts (MIT, see LICENSE). Cases for the `types` option are removed: it needs type information, which this copy rejects. */
import { createTestCases } from './create-test-cases.ts'

createTestCases([
  {
    code: ['class % {}', 'abstract class % {}', 'const ignored = class % {}'],
    options: {
      selector: 'class',
    },
  },
])
