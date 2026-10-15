/*! Ported from typescript-eslint v8.71.1 packages/eslint-plugin/tests/rules/naming-convention/cases/autoAccessor.test.ts (MIT, see LICENSE). Cases for the `types` option are removed: it needs type information, which this copy rejects. */
import { createTestCases } from './create-test-cases.ts'

createTestCases([
  {
    code: [
      'class Ignored { accessor % = 10; }',
      'class Ignored { accessor #% = 10; }',
      'class Ignored { static accessor % = 10; }',
      'class Ignored { static accessor #% = 10; }',
      'class Ignored { private accessor % = 10; }',
      'class Ignored { private static accessor % = 10; }',
      'class Ignored { override accessor % = 10; }',
      'class Ignored { accessor "%" = 10; }',
      'class Ignored { protected accessor % = 10; }',
      'class Ignored { public accessor % = 10; }',
      'class Ignored { abstract accessor %; }',
    ],
    options: {
      selector: 'autoAccessor',
    },
  },
])
