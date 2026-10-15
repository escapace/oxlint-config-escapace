/*! Ported from typescript-eslint v8.71.1 packages/eslint-plugin/tests/rules/naming-convention/cases/method.test.ts (MIT, see LICENSE). Cases for the `types` option are removed: it needs type information, which this copy rejects. */
import { createTestCases } from './create-test-cases.ts'

createTestCases([
  {
    code: [
      'class Ignored { private %() {} }',
      'class Ignored { private "%"() {} }',
      'class Ignored { private async %() {} }',
      'class Ignored { private static %() {} }',
      'class Ignored { private static async %() {} }',
      'class Ignored { private % = () => {} }',
      'class Ignored { abstract %() }',
      'class Ignored { #%() }',
      'class Ignored { static #%() }',
    ],
    options: {
      selector: 'classMethod',
    },
  },
  {
    code: [
      'const ignored = { %() {} };',
      'const ignored = { "%"() {} };',
      'const ignored = { %: () => {} };',
    ],
    options: {
      selector: 'objectLiteralMethod',
    },
  },
  {
    code: [
      'interface Ignored { %(): string }',
      'interface Ignored { "%"(): string }',
      'interface Ignored { %: () => string }',
      'interface Ignored { "%": () => string }',
      'type Ignored = { %(): string }',
      'type Ignored = { "%"(): string }',
      'type Ignored = { %: () => string }',
      'type Ignored = { "%": () => string }',
    ],
    options: {
      selector: 'typeMethod',
    },
  },
])
