/*! Ported from typescript-eslint v8.71.1 packages/eslint-plugin/tests/rules/naming-convention/cases/default.test.ts (MIT, see LICENSE). Cases for the `types` option are removed: it needs type information, which this copy rejects. */
import { createTestCases } from './create-test-cases.ts'

createTestCases([
  {
    code: [
      'const % = 1;',
      'function % () {}',
      '(function (%) {});',
      'class Ignored { constructor(private %) {} }',
      'const ignored = { % };',
      'interface Ignored { %: string }',
      'type Ignored = { %: string }',
      'class Ignored { private % = 1 }',
      'class Ignored { #% = 1 }',
      'class Ignored { constructor(private %) {} }',
      'class Ignored { #%() {} }',
      'class Ignored { private %() {} }',
      'const ignored = { %() {} };',
      'class Ignored { private get %() {} }',
      'enum Ignored { % }',
      'abstract class % {}',
      'interface % { }',
      'type % = { };',
      'enum % {}',
      'interface Ignored<%> extends Ignored<string> {}',
    ],
    options: {
      filter: '[iI]gnored',
      selector: 'default',
    },
  },
])
