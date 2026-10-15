/*! Ported from typescript-eslint v8.71.1 packages/eslint-plugin/tests/rules/naming-convention/cases/typeAlias.test.ts (MIT, see LICENSE). Cases for the `types` option are removed: it needs type information, which this copy rejects. */
import { createTestCases } from './create-test-cases.ts'

createTestCases([
  {
    code: ['type % = {};', 'type % = 1;'],
    options: {
      selector: 'typeAlias',
    },
  },
])
