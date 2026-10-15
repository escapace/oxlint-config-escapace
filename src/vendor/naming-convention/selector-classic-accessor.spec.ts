/*! Ported from typescript-eslint v8.71.1 packages/eslint-plugin/tests/rules/naming-convention/cases/classicAccessor.test.ts (MIT, see LICENSE). Cases for the `types` option are removed: it needs type information, which this copy rejects. */
import { createTestCases } from './create-test-cases.ts'

createTestCases([
  {
    code: [
      'const ignored = { get %() {} };',
      'const ignored = { set "%"(ignored) {} };',
      'class Ignored { private get %() {} }',
      'class Ignored { private set "%"(ignored) {} }',
      'class Ignored { private static get %() {} }',
      'class Ignored { static get #%() {} }',
      'abstract class Ignored { abstract get %(): number }',
      'abstract class Ignored { abstract set %(ignored: number) }',
    ],
    options: {
      selector: 'classicAccessor',
    },
  },
])
