/*! Ported from typescript-eslint v8.71.1 packages/eslint-plugin/tests/rules/naming-convention/cases/property.test.ts (MIT, see LICENSE). Cases for the `types` option are removed: it needs type information, which this copy rejects. */
import { createTestCases } from './create-test-cases.ts'

createTestCases([
  {
    code: [
      'class Ignored { private % }',
      'class Ignored { private "%" = 1 }',
      'class Ignored { private readonly % = 1 }',
      'class Ignored { private static % }',
      'class Ignored { private static readonly % = 1 }',
      'class Ignored { abstract % }',
      'class Ignored { declare % }',
      'class Ignored { #% }',
      'class Ignored { static #% }',
    ],
    options: {
      selector: 'classProperty',
    },
  },
  {
    code: ['const ignored = { % };', 'const ignored = { "%": 1 };'],
    options: {
      selector: 'objectLiteralProperty',
    },
  },
  {
    code: [
      'interface Ignored { % }',
      'interface Ignored { "%": string }',
      'type Ignored = { % }',
      'type Ignored = { "%": string }',
    ],
    options: {
      selector: 'typeProperty',
    },
  },
])
