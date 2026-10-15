/*! Ported from typescript-eslint v8.71.1 packages/eslint-plugin/tests/rules/naming-convention/naming-convention.test.ts (MIT, see LICENSE). Cases for the `types` option are removed: it needs type information, which this copy rejects. */
/* eslint-disable @typescript-eslint/internal/prefer-ast-types-enum */
import { noFormat, RuleTester } from './rule-tester.ts'

import rule from './rule.ts'

const ruleTester = new RuleTester()

ruleTester.run('naming-convention', rule, {
  assertionOptions: {
    requireData: true,
  },
  valid: [
    {
      code: `
const child_process = require('child_process');
      `,
      options: [
        {
          filter: {
            match: false,
            regex: 'child_process',
          },
          format: ['camelCase'],
          selector: 'default',
        },
      ],
    },
    {
      code: `
let foo = 'a';
const _foo = 1;
interface Foo {}
class Bar {}
function foo_function_bar() {}
      `,
      options: [
        {
          custom: {
            match: false,
            regex: /^unused_\w/.source,
          },
          format: ['camelCase'],
          leadingUnderscore: 'allow',
          selector: 'default',
        },
        {
          custom: {
            match: false,
            regex: /^I[A-Z]/.source,
          },
          format: ['PascalCase'],
          selector: 'typeLike',
        },
        {
          custom: {
            match: true,
            regex: /_function_/.source,
          },
          format: ['snake_case'],
          leadingUnderscore: 'allow',
          selector: 'function',
        },
      ],
    },
    {
      code: `
let foo = 'a';
const _foo = 1;
interface foo {}
class bar {}
function fooFunctionBar() {}
function _fooFunctionBar() {}
      `,
      options: [
        {
          custom: {
            match: false,
            regex: /^unused_\w/.source,
          },
          format: ['camelCase'],
          leadingUnderscore: 'allow',
          selector: ['default', 'typeLike', 'function'],
        },
      ],
    },
    {
      code: `
const match = 'test'.match(/test/);
const [, key, value] = match;
      `,
      options: [
        {
          format: ['camelCase'],
          selector: 'default',
        },
      ],
    },
    // no format selector
    {
      code: 'const snake_case = 1;',
      options: [
        {
          format: ['camelCase'],
          selector: 'default',
        },
        {
          format: null,
          selector: 'variable',
        },
      ],
    },
    {
      code: 'const snake_case = 1;',
      options: [
        {
          format: ['camelCase'],
          selector: 'default',
        },
        {
          format: [],
          selector: 'variable',
        },
      ],
    },
    // https://github.com/typescript-eslint/typescript-eslint/issues/1478
    {
      code: `
const child_process = require('child_process');
      `,
      options: [
        { format: ['camelCase', 'UPPER_CASE'], selector: 'variable' },
        {
          filter: 'child_process',
          format: ['snake_case'],
          selector: 'variable',
        },
      ],
    },
    {
      code: `
const foo = {
  'Property-Name': 'asdf',
};
      `,
      options: [
        {
          filter: {
            match: false,
            regex: /-/.source,
          },
          format: ['strictCamelCase'],
          selector: 'default',
        },
      ],
    },
    {
      code: `
const foo = {
  'Property-Name': 'asdf',
};
      `,
      options: [
        {
          filter: {
            match: false,
            regex: /^(Property-Name)$/.source,
          },
          format: ['strictCamelCase'],
          selector: 'default',
        },
      ],
    },
    {
      code: `
class foo {
  private fooBoo: number;
}
      `,
      options: [
        {
          format: ['camelCase'],
          modifiers: ['private'],
          selector: ['property', 'accessor'],
        },
      ],
    },
    {
      code: `
class SomeClass {
  static OtherConstant = 'hello';
}

export const { OtherConstant: otherConstant } = SomeClass;
      `,
      options: [
        { format: ['PascalCase'], selector: 'property' },
        { format: ['camelCase'], selector: 'variable' },
      ],
    },
    // treat properties with function expressions as typeMethod
    {
      code: `
interface SOME_INTERFACE {
  SomeMethod: () => void;

  some_property: string;
}
      `,
      options: [
        {
          format: ['UPPER_CASE'],
          selector: 'default',
        },
        {
          format: ['PascalCase'],
          selector: 'typeMethod',
        },
        {
          format: ['snake_case'],
          selector: 'typeProperty',
        },
      ],
    },
    {
      code: `
type Ignored = {
  ignored_due_to_modifiers: string;
  readonly FOO: string;
};
      `,
      options: [
        {
          format: ['UPPER_CASE'],
          modifiers: ['readonly'],
          selector: 'typeProperty',
        },
      ],
    },
    {
      code: `
const camelCaseVar = 1;
enum camelCaseEnum {}
class camelCaseClass {}
function camelCaseFunction() {}
interface camelCaseInterface {}
type camelCaseType = {};
export const PascalCaseVar = 1;
export enum PascalCaseEnum {}
export class PascalCaseClass {}
export function PascalCaseFunction() {}
export interface PascalCaseInterface {}
export type PascalCaseType = {};
      `,
      options: [
        { format: ['camelCase'], selector: 'default' },
        {
          format: ['PascalCase'],
          modifiers: ['exported'],
          selector: 'variable',
        },
        {
          format: ['PascalCase'],
          modifiers: ['exported'],
          selector: 'function',
        },
        {
          format: ['PascalCase'],
          modifiers: ['exported'],
          selector: 'class',
        },
        {
          format: ['PascalCase'],
          modifiers: ['exported'],
          selector: 'interface',
        },
        {
          format: ['PascalCase'],
          modifiers: ['exported'],
          selector: 'typeAlias',
        },
        {
          format: ['PascalCase'],
          modifiers: ['exported'],
          selector: 'enum',
        },
      ],
    },
    {
      code: `
const camelCaseVar = 1;
enum camelCaseEnum {}
class camelCaseClass {}
function camelCaseFunction() {}
interface camelCaseInterface {}
type camelCaseType = {};
const PascalCaseVar = 1;
enum PascalCaseEnum {}
class PascalCaseClass {}
function PascalCaseFunction() {}
interface PascalCaseInterface {}
type PascalCaseType = {};
export {
  PascalCaseVar,
  PascalCaseEnum,
  PascalCaseClass,
  PascalCaseFunction,
  PascalCaseInterface,
  PascalCaseType,
};
      `,
      options: [
        { format: ['camelCase'], selector: 'default' },
        {
          format: ['PascalCase'],
          modifiers: ['exported'],
          selector: 'variable',
        },
        {
          format: ['PascalCase'],
          modifiers: ['exported'],
          selector: 'function',
        },
        {
          format: ['PascalCase'],
          modifiers: ['exported'],
          selector: 'class',
        },
        {
          format: ['PascalCase'],
          modifiers: ['exported'],
          selector: 'interface',
        },
        {
          format: ['PascalCase'],
          modifiers: ['exported'],
          selector: 'typeAlias',
        },
        {
          format: ['PascalCase'],
          modifiers: ['exported'],
          selector: 'enum',
        },
      ],
    },
    {
      code: `
{
  const camelCaseVar = 1;
  function camelCaseFunction() {}
  declare function camelCaseDeclaredFunction();
}
const PascalCaseVar = 1;
function PascalCaseFunction() {}
declare function PascalCaseDeclaredFunction();
      `,
      options: [
        { format: ['camelCase'], selector: 'default' },
        {
          format: ['PascalCase'],
          modifiers: ['global'],
          selector: 'variable',
        },
        {
          format: ['PascalCase'],
          modifiers: ['global'],
          selector: 'function',
        },
      ],
    },
    {
      code: `
const { some_name1 } = {};
const { ignore: IgnoredDueToModifiers1 } = {};
const { some_name2 = 2 } = {};
const IgnoredDueToModifiers2 = 1;
      `,
      options: [
        {
          format: ['PascalCase'],
          selector: 'default',
        },
        {
          format: ['snake_case'],
          modifiers: ['destructured'],
          selector: 'variable',
        },
      ],
    },
    {
      code: `
const { some_name1 } = {};
const { ignore: IgnoredDueToModifiers1 } = {};
const { some_name2 = 2 } = {};
const IgnoredDueToModifiers2 = 1;
      `,
      options: [
        {
          format: ['PascalCase'],
          selector: 'default',
        },
        {
          format: null,
          modifiers: ['destructured'],
          selector: 'variable',
        },
      ],
    },
    {
      code: `
export function Foo(
  { aName },
  { anotherName = 1 },
  { ignored: IgnoredDueToModifiers1 },
  { ignored: IgnoredDueToModifiers1 = 2 },
  IgnoredDueToModifiers2,
) {}
      `,
      options: [
        {
          format: ['PascalCase'],
          selector: 'default',
        },
        {
          format: ['camelCase'],
          modifiers: ['destructured'],
          selector: 'parameter',
        },
      ],
    },
    {
      code: `
class Ignored {
  private static abstract readonly some_name;
  IgnoredDueToModifiers = 1;
}
      `,
      options: [
        {
          format: ['PascalCase'],
          selector: 'default',
        },
        {
          format: ['snake_case'],
          modifiers: ['static', 'readonly'],
          selector: 'classProperty',
        },
      ],
    },
    {
      code: `
class Ignored {
  constructor(
    private readonly some_name,
    IgnoredDueToModifiers,
  ) {}
}
      `,
      options: [
        {
          format: ['PascalCase'],
          selector: 'default',
        },
        {
          format: ['snake_case'],
          modifiers: ['readonly'],
          selector: 'parameterProperty',
        },
      ],
    },
    {
      code: `
class Ignored {
  private static some_name() {}
  IgnoredDueToModifiers() {}
}
      `,
      options: [
        {
          format: ['PascalCase'],
          selector: 'default',
        },
        {
          format: ['snake_case'],
          modifiers: ['static'],
          selector: 'classMethod',
        },
      ],
    },
    {
      code: `
class Ignored {
  private static get some_name() {}
  get IgnoredDueToModifiers() {}
}
      `,
      options: [
        {
          format: ['PascalCase'],
          selector: 'default',
        },
        {
          format: ['snake_case'],
          modifiers: ['private', 'static'],
          selector: 'accessor',
        },
      ],
    },
    {
      code: `
abstract class some_name {}
class IgnoredDueToModifier {}
      `,
      options: [
        {
          format: ['PascalCase'],
          selector: 'default',
        },
        {
          format: ['snake_case'],
          modifiers: ['abstract'],
          selector: 'class',
        },
      ],
    },
    {
      code: `
const UnusedVar = 1;
function UnusedFunc(
  // this line is intentionally broken out
  UnusedParam: string,
) {}
class UnusedClass {}
interface UnusedInterface {}
type UnusedType<
  // this line is intentionally broken out
  UnusedTypeParam,
> = {};

export const used_var = 1;
export function used_func(
  // this line is intentionally broken out
  used_param: string,
) {
  return used_param;
}
export class used_class {}
export interface used_interface {}
export type used_type<
  // this line is intentionally broken out
  used_typeparam,
> = used_typeparam;
      `,
      options: [
        {
          format: ['snake_case'],
          selector: 'default',
        },
        {
          format: ['PascalCase'],
          modifiers: ['unused'],
          selector: 'default',
        },
      ],
    },
    {
      code: `
const ignored1 = {
  'a a': 1,
  'b b'() {},
  get 'c c'() {
    return 1;
  },
  set 'd d'(value: string) {},
};
class ignored2 {
  'a a' = 1;
  'b b'() {}
  get 'c c'() {
    return 1;
  }
  set 'd d'(value: string) {}
}
interface ignored3 {
  'a a': 1;
  'b b'(): void;
}
type ignored4 = {
  'a a': 1;
  'b b'(): void;
};
enum ignored5 {
  'a a',
}
      `,
      options: [
        {
          format: ['snake_case'],
          selector: 'default',
        },
        {
          format: null,
          modifiers: ['requiresQuotes'],
          selector: 'default',
        },
      ],
    },
    {
      code: `
const ignored1 = {
  'a a': 1,
  'b b'() {},
  get 'c c'() {
    return 1;
  },
  set 'd d'(value: string) {},
};
class ignored2 {
  'a a' = 1;
  'b b'() {}
  get 'c c'() {
    return 1;
  }
  set 'd d'(value: string) {}
}
interface ignored3 {
  'a a': 1;
  'b b'(): void;
}
type ignored4 = {
  'a a': 1;
  'b b'(): void;
};
enum ignored5 {
  'a a',
}
      `,
      options: [
        {
          format: ['snake_case'],
          selector: 'default',
        },
        {
          format: null,
          modifiers: ['requiresQuotes'],
          selector: [
            'classProperty',
            'objectLiteralProperty',
            'typeProperty',
            'classMethod',
            'objectLiteralMethod',
            'typeMethod',
            'accessor',
            'enumMember',
          ],
        },
        // making sure the `requiresQuotes` modifier appropriately overrides this
        {
          format: ['PascalCase'],
          selector: [
            'classProperty',
            'objectLiteralProperty',
            'typeProperty',
            'classMethod',
            'objectLiteralMethod',
            'typeMethod',
            'accessor',
            'enumMember',
          ],
        },
      ],
    },
    {
      code: `
const obj = {
  Foo: 42,
  Bar() {
    return 42;
  },
};
      `,
      options: [
        {
          format: ['camelCase'],
          selector: 'memberLike',
        },
        {
          format: ['PascalCase'],
          selector: 'property',
        },
        {
          format: ['PascalCase'],
          selector: 'method',
        },
      ],
    },
    {
      code: `
const obj = {
  Bar() {
    return 42;
  },
  async async_bar() {
    return 42;
  },
};
class foo {
  public Bar() {
    return 42;
  }
  public async async_bar() {
    return 42;
  }
}
abstract class foo {
  public Bar() {
    return 42;
  }
  public async async_bar() {
    return 42;
  }
}
      `,
      options: [
        {
          format: ['camelCase'],
          selector: 'memberLike',
        },
        {
          format: ['snake_case'],
          modifiers: ['async'],
          selector: ['method', 'objectLiteralMethod'],
        },
        {
          format: ['PascalCase'],
          selector: 'method',
        },
      ],
    },
    {
      code: `
const async_bar1 = async () => {};
async function async_bar2() {}
const async_bar3 = async function async_bar4() {};
      `,
      options: [
        {
          format: ['camelCase'],
          selector: 'memberLike',
        },
        {
          format: ['PascalCase'],
          selector: 'method',
        },
        {
          format: ['snake_case'],
          modifiers: ['async'],
          selector: ['variable'],
        },
      ],
    },
    {
      code: `
class foo extends bar {
  public someAttribute = 1;
  public override some_attribute_override = 1;
  public someMethod() {
    return 42;
  }
  public override some_method_override2() {
    return 42;
  }
}
abstract class foo extends bar {
  public abstract someAttribute: string;
  public abstract override some_attribute_override: string;
  public abstract someMethod(): string;
  public abstract override some_method_override2(): string;
}
      `,
      options: [
        {
          format: ['camelCase'],
          selector: 'memberLike',
        },
        {
          format: ['snake_case'],
          modifiers: ['override'],
          selector: ['memberLike'],
        },
      ],
    },
    {
      code: `
class foo {
  private someAttribute = 1;
  #some_attribute = 1;

  private someMethod() {}
  #some_method() {}
}
      `,
      options: [
        {
          format: ['camelCase'],
          selector: 'memberLike',
        },
        {
          format: ['snake_case'],
          modifiers: ['#private'],
          selector: ['memberLike'],
        },
      ],
    },
    {
      code: "import * as FooBar from 'foo_bar';",
      options: [
        {
          format: ['PascalCase'],
          selector: ['import'],
        },
        {
          format: ['camelCase'],
          modifiers: ['default'],
          selector: ['import'],
        },
      ],
    },
    {
      code: "import fooBar from 'foo_bar';",
      options: [
        {
          format: ['PascalCase'],
          selector: ['import'],
        },
        {
          format: ['camelCase'],
          modifiers: ['default'],
          selector: ['import'],
        },
      ],
    },
    {
      code: "import { default as fooBar } from 'foo_bar';",
      options: [
        {
          format: ['PascalCase'],
          selector: ['import'],
        },
        {
          format: ['camelCase'],
          modifiers: ['default'],
          selector: ['import'],
        },
      ],
    },
    {
      code: "import { foo_bar } from 'foo_bar';",
      options: [
        {
          format: ['PascalCase'],
          selector: ['import'],
        },
        {
          format: ['camelCase'],
          modifiers: ['default'],
          selector: ['import'],
        },
      ],
    },
    {
      code: "import { '🍎' as Foo } from 'foo_bar';",
      options: [
        {
          format: ['PascalCase'],
          selector: ['import'],
        },
      ],
    },
  ],
  invalid: [
    {
      // make sure we handle no options and apply defaults
      code: 'const x_x = 1;',
      errors: [
        {
          column: 7,
          data: {
            formats: 'camelCase, UPPER_CASE',
            name: 'x_x',
            type: 'Variable',
          },
          endColumn: 10,
          endLine: 1,
          line: 1,
          messageId: 'doesNotMatchFormat',
        },
      ],
    },
    {
      // make sure we handle empty options and apply defaults
      code: 'const x_x = 1;',
      errors: [
        {
          column: 7,
          data: {
            formats: 'camelCase, UPPER_CASE',
            name: 'x_x',
            type: 'Variable',
          },
          endColumn: 10,
          endLine: 1,
          line: 1,
          messageId: 'doesNotMatchFormat',
        },
      ],
      options: [],
    },
    {
      code: `
const child_process = require('child_process');
      `,
      errors: [
        {
          column: 7,
          data: {
            formats: 'camelCase',
            name: 'child_process',
            type: 'Variable',
          },
          endColumn: 20,
          endLine: 2,
          line: 2,
          messageId: 'doesNotMatchFormat',
        },
      ],
      options: [
        {
          filter: {
            match: true,
            regex: 'child_process',
          },
          format: ['camelCase'],
          selector: 'default',
        },
      ],
    },
    {
      code: `
let unused_foo = 'a';
      `,
      errors: [
        {
          column: 5,
          data: {
            name: 'unused_foo',
            regex: '/^unused_\\w/u',
            regexMatch: 'not match',
            type: 'Variable',
          },
          endColumn: 15,
          endLine: 2,
          line: 2,
          messageId: 'satisfyCustom',
        },
      ],
      options: [
        {
          custom: {
            match: false,
            regex: /^unused_\w/.source,
          },
          format: ['snake_case'],
          leadingUnderscore: 'allow',
          selector: 'default',
        },
      ],
    },
    {
      code: `
const _unused_foo = 1;
      `,
      errors: [
        {
          column: 7,
          data: {
            name: '_unused_foo',
            regex: '/^unused_\\w/u',
            regexMatch: 'not match',
            type: 'Variable',
          },
          endColumn: 18,
          endLine: 2,
          line: 2,
          messageId: 'satisfyCustom',
        },
      ],
      options: [
        {
          custom: {
            match: false,
            regex: /^unused_\w/.source,
          },
          format: ['snake_case'],
          leadingUnderscore: 'allow',
          selector: 'default',
        },
      ],
    },
    {
      code: `
interface IFoo {}
      `,
      errors: [
        {
          column: 11,
          data: {
            name: 'IFoo',
            regex: '/^I[A-Z]/u',
            regexMatch: 'not match',
            type: 'Interface',
          },
          endColumn: 15,
          endLine: 2,
          line: 2,
          messageId: 'satisfyCustom',
        },
      ],
      options: [
        {
          custom: {
            match: false,
            regex: /^I[A-Z]/.source,
          },
          format: ['PascalCase'],
          selector: 'typeLike',
        },
      ],
    },
    {
      code: `
class IBar {}
      `,
      errors: [
        {
          column: 7,
          data: {
            name: 'IBar',
            regex: '/^I[A-Z]/u',
            regexMatch: 'not match',
            type: 'Class',
          },
          endColumn: 11,
          endLine: 2,
          line: 2,
          messageId: 'satisfyCustom',
        },
      ],
      options: [
        {
          custom: {
            match: false,
            regex: /^I[A-Z]/.source,
          },
          format: ['PascalCase'],
          selector: 'typeLike',
        },
      ],
    },
    {
      code: `
function fooBar() {}
      `,
      errors: [
        {
          column: 10,
          data: {
            name: 'fooBar',
            regex: '/function/u',
            regexMatch: 'match',
            type: 'Function',
          },
          endColumn: 16,
          endLine: 2,
          line: 2,
          messageId: 'satisfyCustom',
        },
      ],
      options: [
        {
          custom: {
            match: true,
            regex: /function/.source,
          },
          format: ['camelCase'],
          leadingUnderscore: 'allow',
          selector: 'function',
        },
      ],
    },
    {
      code: `
let unused_foo = 'a';
      `,
      errors: [
        {
          column: 5,
          data: {
            formats: 'camelCase',
            name: 'unused_foo',
            type: 'Variable',
          },
          endColumn: 15,
          endLine: 2,
          line: 2,
          messageId: 'doesNotMatchFormat',
        },
      ],
      options: [
        {
          format: ['camelCase'],
          leadingUnderscore: 'allow',
          selector: ['variable', 'function'],
        },
      ],
    },
    {
      code: `
const _unused_foo = 1;
      `,
      errors: [
        {
          column: 7,
          data: {
            formats: 'camelCase',
            name: '_unused_foo',
            processedName: 'unused_foo',
            type: 'Variable',
          },
          endColumn: 18,
          endLine: 2,
          line: 2,
          messageId: 'doesNotMatchFormatTrimmed',
        },
      ],
      options: [
        {
          format: ['camelCase'],
          leadingUnderscore: 'allow',
          selector: ['variable', 'function'],
        },
      ],
    },
    {
      code: `
function foo_bar() {}
      `,
      errors: [
        {
          column: 10,
          data: {
            formats: 'camelCase',
            name: 'foo_bar',
            type: 'Function',
          },
          endColumn: 17,
          endLine: 2,
          line: 2,
          messageId: 'doesNotMatchFormat',
        },
      ],
      options: [
        {
          format: ['camelCase'],
          leadingUnderscore: 'allow',
          selector: ['variable', 'function'],
        },
      ],
    },
    {
      code: `
interface IFoo {}
      `,
      errors: [
        {
          column: 11,
          data: {
            name: 'IFoo',
            regex: '/^I[A-Z]/u',
            regexMatch: 'not match',
            type: 'Interface',
          },
          endColumn: 15,
          endLine: 2,
          line: 2,
          messageId: 'satisfyCustom',
        },
      ],
      options: [
        {
          custom: {
            match: false,
            regex: /^I[A-Z]/.source,
          },
          format: ['PascalCase'],
          selector: ['class', 'interface'],
        },
      ],
    },
    {
      code: `
class IBar {}
      `,
      errors: [
        {
          column: 7,
          data: {
            name: 'IBar',
            regex: '/^I[A-Z]/u',
            regexMatch: 'not match',
            type: 'Class',
          },
          endColumn: 11,
          endLine: 2,
          line: 2,
          messageId: 'satisfyCustom',
        },
      ],
      options: [
        {
          format: ['camelCase'],
          leadingUnderscore: 'allow',
          selector: ['variable', 'function'],
        },
        {
          custom: {
            match: false,
            regex: /^I[A-Z]/.source,
          },
          format: ['PascalCase'],
          selector: ['class', 'interface'],
        },
      ],
    },
    {
      code: `
const foo = {
  'Property Name': 'asdf',
};
      `,
      errors: [
        {
          column: 3,
          data: {
            formats: 'strictCamelCase',
            name: 'Property Name',
            type: 'Object Literal Property',
          },
          endColumn: 18,
          endLine: 3,
          line: 3,
          messageId: 'doesNotMatchFormat',
        },
      ],
      options: [
        {
          filter: {
            match: false,
            regex: /-/.source,
          },
          format: ['strictCamelCase'],
          selector: 'default',
        },
      ],
    },
    {
      code: `
class foo {
  private readonly fooBar: boolean;
}
      `,
      errors: [
        {
          column: 20,
          data: {
            formats: 'PascalCase',
            name: 'fooBar',
            type: 'Class Property',
          },
          endColumn: 26,
          endLine: 3,
          line: 3,
          messageId: 'doesNotMatchFormat',
        },
      ],
      options: [
        {
          format: ['PascalCase'],
          modifiers: ['private', 'readonly'],
          selector: ['property', 'accessor'],
        },
      ],
    },
    {
      code: `
class SomeClass {
  static otherConstant = 'hello';
}

export const { otherConstant } = SomeClass;
      `,
      errors: [
        {
          column: 10,
          data: {
            formats: 'PascalCase',
            name: 'otherConstant',
            type: 'Class Property',
          },
          endColumn: 23,
          endLine: 3,
          line: 3,
          messageId: 'doesNotMatchFormat',
        },
      ],
      options: [
        { format: ['PascalCase'], selector: 'property' },
        { format: ['camelCase'], selector: 'variable' },
      ],
    },
    {
      code: `
declare class Foo {
  Bar(Baz: string): void;
}
      `,
      errors: [
        {
          column: 7,
          data: {
            formats: 'camelCase',
            name: 'Baz',
            type: 'Parameter',
          },
          endColumn: 18,
          endLine: 3,
          line: 3,
          messageId: 'doesNotMatchFormat',
        },
      ],
      options: [{ format: ['camelCase'], selector: 'parameter' }],
    },
    {
      code: `
export const PascalCaseVar = 1;
export enum PascalCaseEnum {}
export class PascalCaseClass {}
export function PascalCaseFunction() {}
export interface PascalCaseInterface {}
export type PascalCaseType = {};
      `,
      errors: [
        {
          column: 14,
          data: {
            formats: 'camelCase',
            name: 'PascalCaseVar',
            type: 'Variable',
          },
          endColumn: 27,
          endLine: 2,
          line: 2,
          messageId: 'doesNotMatchFormat',
        },
        {
          column: 13,
          data: {
            formats: 'camelCase',
            name: 'PascalCaseEnum',
            type: 'Enum',
          },
          endColumn: 27,
          endLine: 3,
          line: 3,
          messageId: 'doesNotMatchFormat',
        },
        {
          column: 14,
          data: {
            formats: 'camelCase',
            name: 'PascalCaseClass',
            type: 'Class',
          },
          endColumn: 29,
          endLine: 4,
          line: 4,
          messageId: 'doesNotMatchFormat',
        },
        {
          column: 17,
          data: {
            formats: 'camelCase',
            name: 'PascalCaseFunction',
            type: 'Function',
          },
          endColumn: 35,
          endLine: 5,
          line: 5,
          messageId: 'doesNotMatchFormat',
        },
        {
          column: 18,
          data: {
            formats: 'camelCase',
            name: 'PascalCaseInterface',
            type: 'Interface',
          },
          endColumn: 37,
          endLine: 6,
          line: 6,
          messageId: 'doesNotMatchFormat',
        },
        {
          column: 13,
          data: {
            formats: 'camelCase',
            name: 'PascalCaseType',
            type: 'Type Alias',
          },
          endColumn: 27,
          endLine: 7,
          line: 7,
          messageId: 'doesNotMatchFormat',
        },
      ],
      options: [
        {
          format: ['snake_case'],
          selector: 'default',
        },
        {
          format: ['camelCase'],
          modifiers: ['exported'],
          selector: 'variable',
        },
        {
          format: ['camelCase'],
          modifiers: ['exported'],
          selector: 'function',
        },
        {
          format: ['camelCase'],
          modifiers: ['exported'],
          selector: 'class',
        },
        {
          format: ['camelCase'],
          modifiers: ['exported'],
          selector: 'interface',
        },
        {
          format: ['camelCase'],
          modifiers: ['exported'],
          selector: 'typeAlias',
        },
        {
          format: ['camelCase'],
          modifiers: ['exported'],
          selector: 'enum',
        },
      ],
    },
    {
      code: `
const PascalCaseVar = 1;
enum PascalCaseEnum {}
class PascalCaseClass {}
function PascalCaseFunction() {}
interface PascalCaseInterface {}
type PascalCaseType = {};
export {
  PascalCaseVar,
  PascalCaseEnum,
  PascalCaseClass,
  PascalCaseFunction,
  PascalCaseInterface,
  PascalCaseType,
};
      `,
      errors: [
        {
          column: 7,
          data: {
            formats: 'camelCase',
            name: 'PascalCaseVar',
            type: 'Variable',
          },
          endColumn: 20,
          endLine: 2,
          line: 2,
          messageId: 'doesNotMatchFormat',
        },
        {
          column: 6,
          data: {
            formats: 'camelCase',
            name: 'PascalCaseEnum',
            type: 'Enum',
          },
          endColumn: 20,
          endLine: 3,
          line: 3,
          messageId: 'doesNotMatchFormat',
        },
        {
          column: 7,
          data: {
            formats: 'camelCase',
            name: 'PascalCaseClass',
            type: 'Class',
          },
          endColumn: 22,
          endLine: 4,
          line: 4,
          messageId: 'doesNotMatchFormat',
        },
        {
          column: 10,
          data: {
            formats: 'camelCase',
            name: 'PascalCaseFunction',
            type: 'Function',
          },
          endColumn: 28,
          endLine: 5,
          line: 5,
          messageId: 'doesNotMatchFormat',
        },
        {
          column: 11,
          data: {
            formats: 'camelCase',
            name: 'PascalCaseInterface',
            type: 'Interface',
          },
          endColumn: 30,
          endLine: 6,
          line: 6,
          messageId: 'doesNotMatchFormat',
        },
        {
          column: 6,
          data: {
            formats: 'camelCase',
            name: 'PascalCaseType',
            type: 'Type Alias',
          },
          endColumn: 20,
          endLine: 7,
          line: 7,
          messageId: 'doesNotMatchFormat',
        },
      ],
      options: [
        { format: ['snake_case'], selector: 'default' },
        {
          format: ['camelCase'],
          modifiers: ['exported'],
          selector: 'variable',
        },
        {
          format: ['camelCase'],
          modifiers: ['exported'],
          selector: 'function',
        },
        {
          format: ['camelCase'],
          modifiers: ['exported'],
          selector: 'class',
        },
        {
          format: ['camelCase'],
          modifiers: ['exported'],
          selector: 'interface',
        },
        {
          format: ['camelCase'],
          modifiers: ['exported'],
          selector: 'typeAlias',
        },
        {
          format: ['camelCase'],
          modifiers: ['exported'],
          selector: 'enum',
        },
      ],
    },
    {
      code: `
const PascalCaseVar = 1;
function PascalCaseFunction() {}
declare function PascalCaseDeclaredFunction();
      `,
      errors: [
        {
          column: 7,
          data: {
            formats: 'camelCase',
            name: 'PascalCaseVar',
            type: 'Variable',
          },
          endColumn: 20,
          endLine: 2,
          line: 2,
          messageId: 'doesNotMatchFormat',
        },
        {
          column: 10,
          data: {
            formats: 'camelCase',
            name: 'PascalCaseFunction',
            type: 'Function',
          },
          endColumn: 28,
          endLine: 3,
          line: 3,
          messageId: 'doesNotMatchFormat',
        },
        {
          column: 18,
          data: {
            formats: 'camelCase',
            name: 'PascalCaseDeclaredFunction',
            type: 'Function',
          },
          endColumn: 44,
          endLine: 4,
          line: 4,
          messageId: 'doesNotMatchFormat',
        },
      ],
      options: [
        { format: ['snake_case'], selector: 'default' },
        {
          format: ['camelCase'],
          modifiers: ['global'],
          selector: 'variable',
        },
        {
          format: ['camelCase'],
          modifiers: ['global'],
          selector: 'function',
        },
      ],
    },
    {
      code: `
const { some_name1 } = {};
const { some_name2 = 2 } = {};
const { ignored: IgnoredDueToModifiers1 } = {};
const { ignored: IgnoredDueToModifiers2 = 3 } = {};
const IgnoredDueToModifiers3 = 1;
      `,
      errors: [
        {
          column: 9,
          data: {
            formats: 'UPPER_CASE',
            name: 'some_name1',
            type: 'Variable',
          },
          endColumn: 19,
          endLine: 2,
          line: 2,
          messageId: 'doesNotMatchFormat',
        },
        {
          column: 9,
          data: {
            formats: 'UPPER_CASE',
            name: 'some_name2',
            type: 'Variable',
          },
          endColumn: 19,
          endLine: 3,
          line: 3,
          messageId: 'doesNotMatchFormat',
        },
      ],
      options: [
        {
          format: ['PascalCase'],
          selector: 'default',
        },
        {
          format: ['UPPER_CASE'],
          modifiers: ['destructured'],
          selector: 'variable',
        },
      ],
    },
    {
      code: `
export function Foo(
  { aName },
  { anotherName = 1 },
  { ignored: IgnoredDueToModifiers1 },
  { ignored: IgnoredDueToModifiers1 = 2 },
  IgnoredDueToModifiers2,
) {}
      `,
      errors: [
        {
          column: 5,
          data: {
            formats: 'UPPER_CASE',
            name: 'aName',
            type: 'Parameter',
          },
          endColumn: 10,
          endLine: 3,
          line: 3,
          messageId: 'doesNotMatchFormat',
        },
        {
          column: 5,
          data: {
            formats: 'UPPER_CASE',
            name: 'anotherName',
            type: 'Parameter',
          },
          endColumn: 16,
          endLine: 4,
          line: 4,
          messageId: 'doesNotMatchFormat',
        },
      ],
      options: [
        {
          format: ['PascalCase'],
          selector: 'default',
        },
        {
          format: ['UPPER_CASE'],
          modifiers: ['destructured'],
          selector: 'parameter',
        },
      ],
    },
    {
      code: `
class Ignored {
  private static abstract readonly some_name;
  IgnoredDueToModifiers = 1;
}
      `,
      errors: [
        {
          column: 36,
          data: {
            formats: 'UPPER_CASE',
            name: 'some_name',
            type: 'Class Property',
          },
          endColumn: 45,
          endLine: 3,
          line: 3,
          messageId: 'doesNotMatchFormat',
        },
      ],
      options: [
        {
          format: ['PascalCase'],
          selector: 'default',
        },
        {
          format: ['UPPER_CASE'],
          modifiers: ['static', 'readonly'],
          selector: 'classProperty',
        },
      ],
    },
    {
      code: `
class Ignored {
  constructor(
    private readonly some_name,
    IgnoredDueToModifiers,
  ) {}
}
      `,
      errors: [
        {
          column: 22,
          data: {
            formats: 'UPPER_CASE',
            name: 'some_name',
            type: 'Parameter Property',
          },
          endColumn: 31,
          endLine: 4,
          line: 4,
          messageId: 'doesNotMatchFormat',
        },
      ],
      options: [
        {
          format: ['PascalCase'],
          selector: 'default',
        },
        {
          format: ['UPPER_CASE'],
          modifiers: ['readonly'],
          selector: 'parameterProperty',
        },
      ],
    },
    {
      code: `
class Ignored {
  private static some_name() {}
  IgnoredDueToModifiers() {}
}
      `,
      errors: [
        {
          column: 18,
          data: {
            formats: 'UPPER_CASE',
            name: 'some_name',
            type: 'Class Method',
          },
          endColumn: 27,
          endLine: 3,
          line: 3,
          messageId: 'doesNotMatchFormat',
        },
      ],
      options: [
        {
          format: ['PascalCase'],
          selector: 'default',
        },
        {
          format: ['UPPER_CASE'],
          modifiers: ['static'],
          selector: 'classMethod',
        },
      ],
    },
    {
      code: `
class Ignored {
  private static get some_name() {}
  get IgnoredDueToModifiers() {}
}
      `,
      errors: [
        {
          column: 22,
          data: {
            formats: 'UPPER_CASE',
            name: 'some_name',
            type: 'Classic Accessor',
          },
          endColumn: 31,
          endLine: 3,
          line: 3,
          messageId: 'doesNotMatchFormat',
        },
      ],
      options: [
        {
          format: ['PascalCase'],
          selector: 'default',
        },
        {
          format: ['UPPER_CASE'],
          modifiers: ['private', 'static'],
          selector: 'accessor',
        },
      ],
    },
    {
      code: `
abstract class some_name {}
class IgnoredDueToModifier {}
      `,
      errors: [
        {
          column: 16,
          data: {
            formats: 'UPPER_CASE',
            name: 'some_name',
            type: 'Class',
          },
          endColumn: 25,
          endLine: 2,
          line: 2,
          messageId: 'doesNotMatchFormat',
        },
      ],
      options: [
        {
          format: ['PascalCase'],
          selector: 'default',
        },
        {
          format: ['UPPER_CASE'],
          modifiers: ['abstract'],
          selector: 'class',
        },
      ],
    },
    {
      code: `
const UnusedVar = 1;
function UnusedFunc(
  // this line is intentionally broken out
  UnusedParam: string,
) {}
class UnusedClass {}
interface UnusedInterface {}
type UnusedType<
  // this line is intentionally broken out
  UnusedTypeParam,
> = {};
      `,
      errors: [
        {
          column: 7,
          data: {
            formats: 'snake_case',
            name: 'UnusedVar',
            type: 'Variable',
          },
          endColumn: 16,
          endLine: 2,
          line: 2,
          messageId: 'doesNotMatchFormat',
        },
        {
          column: 10,
          data: {
            formats: 'snake_case',
            name: 'UnusedFunc',
            type: 'Function',
          },
          endColumn: 20,
          endLine: 3,
          line: 3,
          messageId: 'doesNotMatchFormat',
        },
        {
          column: 3,
          data: {
            formats: 'snake_case',
            name: 'UnusedParam',
            type: 'Parameter',
          },
          endColumn: 22,
          endLine: 5,
          line: 5,
          messageId: 'doesNotMatchFormat',
        },
        {
          column: 7,
          data: {
            formats: 'snake_case',
            name: 'UnusedClass',
            type: 'Class',
          },
          endColumn: 18,
          endLine: 7,
          line: 7,
          messageId: 'doesNotMatchFormat',
        },
        {
          column: 11,
          data: {
            formats: 'snake_case',
            name: 'UnusedInterface',
            type: 'Interface',
          },
          endColumn: 26,
          endLine: 8,
          line: 8,
          messageId: 'doesNotMatchFormat',
        },
        {
          column: 6,
          data: {
            formats: 'snake_case',
            name: 'UnusedType',
            type: 'Type Alias',
          },
          endColumn: 16,
          endLine: 9,
          line: 9,
          messageId: 'doesNotMatchFormat',
        },
        {
          column: 3,
          data: {
            formats: 'snake_case',
            name: 'UnusedTypeParam',
            type: 'Type Parameter',
          },
          endColumn: 18,
          endLine: 11,
          line: 11,
          messageId: 'doesNotMatchFormat',
        },
      ],
      options: [
        {
          format: ['PascalCase'],
          selector: 'default',
        },
        {
          format: ['snake_case'],
          modifiers: ['unused'],
          selector: 'default',
        },
      ],
    },
    {
      code: `
const ignored1 = {
  'a a': 1,
  'b b'() {},
  get 'c c'() {
    return 1;
  },
  set 'd d'(value: string) {},
};
class ignored2 {
  'a a' = 1;
  'b b'() {}
  get 'c c'() {
    return 1;
  }
  set 'd d'(value: string) {}
}
interface ignored3 {
  'a a': 1;
  'b b'(): void;
}
type ignored4 = {
  'a a': 1;
  'b b'(): void;
};
enum ignored5 {
  'a a',
}
      `,
      errors: [
        {
          column: 3,
          data: {
            formats: 'PascalCase',
            name: 'a a',
            type: 'Object Literal Property',
          },
          endColumn: 8,
          endLine: 3,
          line: 3,
          messageId: 'doesNotMatchFormat',
        },
        {
          column: 3,
          data: {
            formats: 'PascalCase',
            name: 'b b',
            type: 'Object Literal Method',
          },
          endColumn: 8,
          endLine: 4,
          line: 4,
          messageId: 'doesNotMatchFormat',
        },
        {
          column: 7,
          data: {
            formats: 'PascalCase',
            name: 'c c',
            type: 'Classic Accessor',
          },
          endColumn: 12,
          endLine: 5,
          line: 5,
          messageId: 'doesNotMatchFormat',
        },
        {
          column: 7,
          data: {
            formats: 'PascalCase',
            name: 'd d',
            type: 'Classic Accessor',
          },
          endColumn: 12,
          endLine: 8,
          line: 8,
          messageId: 'doesNotMatchFormat',
        },
        {
          column: 3,
          data: {
            formats: 'PascalCase',
            name: 'a a',
            type: 'Class Property',
          },
          endColumn: 8,
          endLine: 11,
          line: 11,
          messageId: 'doesNotMatchFormat',
        },
        {
          column: 3,
          data: {
            formats: 'PascalCase',
            name: 'b b',
            type: 'Class Method',
          },
          endColumn: 8,
          endLine: 12,
          line: 12,
          messageId: 'doesNotMatchFormat',
        },
        {
          column: 7,
          data: {
            formats: 'PascalCase',
            name: 'c c',
            type: 'Classic Accessor',
          },
          endColumn: 12,
          endLine: 13,
          line: 13,
          messageId: 'doesNotMatchFormat',
        },
        {
          column: 7,
          data: {
            formats: 'PascalCase',
            name: 'd d',
            type: 'Classic Accessor',
          },
          endColumn: 12,
          endLine: 16,
          line: 16,
          messageId: 'doesNotMatchFormat',
        },
        {
          column: 3,
          data: {
            formats: 'PascalCase',
            name: 'a a',
            type: 'Type Property',
          },
          endColumn: 8,
          endLine: 19,
          line: 19,
          messageId: 'doesNotMatchFormat',
        },
        {
          column: 3,
          data: {
            formats: 'PascalCase',
            name: 'b b',
            type: 'Type Method',
          },
          endColumn: 8,
          endLine: 20,
          line: 20,
          messageId: 'doesNotMatchFormat',
        },
        {
          column: 3,
          data: {
            formats: 'PascalCase',
            name: 'a a',
            type: 'Type Property',
          },
          endColumn: 8,
          endLine: 23,
          line: 23,
          messageId: 'doesNotMatchFormat',
        },
        {
          column: 3,
          data: {
            formats: 'PascalCase',
            name: 'b b',
            type: 'Type Method',
          },
          endColumn: 8,
          endLine: 24,
          line: 24,
          messageId: 'doesNotMatchFormat',
        },
        {
          column: 3,
          data: {
            formats: 'PascalCase',
            name: 'a a',
            type: 'Enum Member',
          },
          endColumn: 8,
          endLine: 27,
          line: 27,
          messageId: 'doesNotMatchFormat',
        },
      ],
      options: [
        {
          format: ['snake_case'],
          selector: 'default',
        },
        {
          format: ['PascalCase'],
          modifiers: ['requiresQuotes'],
          selector: 'default',
        },
      ],
    },
    {
      code: noFormat`
        type Foo = {
          'foo     Bar': string;
          '': string;
          '0': string;
          'foo': string;
          'foo-bar': string;
          '#foo-bar': string;
        };

        interface Bar {
          'boo-----foo': string;
        }
      `,
      // 6, not 7 because 'foo' is valid
      errors: [
        {
          column: 11,
          data: {
            formats: 'camelCase',
            name: 'foo     Bar',
            type: 'Type Property',
          },
          endColumn: 24,
          endLine: 3,
          line: 3,
          messageId: 'doesNotMatchFormat',
        },
        {
          column: 11,
          data: {
            formats: 'camelCase',
            name: '',
            type: 'Type Property',
          },
          endColumn: 13,
          endLine: 4,
          line: 4,
          messageId: 'doesNotMatchFormat',
        },
        {
          column: 11,
          data: {
            formats: 'camelCase',
            name: '0',
            type: 'Type Property',
          },
          endColumn: 14,
          endLine: 5,
          line: 5,
          messageId: 'doesNotMatchFormat',
        },
        {
          column: 11,
          data: {
            formats: 'camelCase',
            name: 'foo-bar',
            type: 'Type Property',
          },
          endColumn: 20,
          endLine: 7,
          line: 7,
          messageId: 'doesNotMatchFormat',
        },
        {
          column: 11,
          data: {
            formats: 'camelCase',
            name: '#foo-bar',
            type: 'Type Property',
          },
          endColumn: 21,
          endLine: 8,
          line: 8,
          messageId: 'doesNotMatchFormat',
        },
        {
          column: 11,
          data: {
            formats: 'camelCase',
            name: 'boo-----foo',
            type: 'Type Property',
          },
          endColumn: 24,
          endLine: 12,
          line: 12,
          messageId: 'doesNotMatchFormat',
        },
      ],
    },
    {
      code: `
class foo {
  public Bar() {
    return 42;
  }
  public async async_bar() {
    return 42;
  }
  // ❌ error
  public async asyncBar() {
    return 42;
  }
  // ❌ error
  public AsyncBar2 = async () => {
    return 42;
  };
  // ❌ error
  public AsyncBar3 = async function () {
    return 42;
  };
}
abstract class foo {
  public abstract Bar(): number;
  public abstract async async_bar(): number;
  // ❌ error
  public abstract async ASYNC_BAR(): number;
}
      `,
      errors: [
        {
          column: 16,
          data: {
            formats: 'snake_case',
            name: 'asyncBar',
            type: 'Class Method',
          },
          endColumn: 24,
          endLine: 10,
          line: 10,
          messageId: 'doesNotMatchFormat',
        },
        {
          column: 10,
          data: {
            formats: 'snake_case',
            name: 'AsyncBar2',
            type: 'Class Method',
          },
          endColumn: 19,
          endLine: 14,
          line: 14,
          messageId: 'doesNotMatchFormat',
        },
        {
          column: 10,
          data: {
            formats: 'snake_case',
            name: 'AsyncBar3',
            type: 'Class Method',
          },
          endColumn: 19,
          endLine: 18,
          line: 18,
          messageId: 'doesNotMatchFormat',
        },
        {
          column: 25,
          data: {
            formats: 'snake_case',
            name: 'ASYNC_BAR',
            type: 'Class Method',
          },
          endColumn: 34,
          endLine: 26,
          line: 26,
          messageId: 'doesNotMatchFormat',
        },
      ],
      options: [
        {
          format: ['camelCase'],
          selector: 'memberLike',
        },
        {
          format: ['PascalCase'],
          selector: 'method',
        },
        {
          format: ['snake_case'],
          modifiers: ['async'],
          selector: ['method', 'objectLiteralMethod'],
        },
      ],
    },
    {
      code: `
const obj = {
  Bar() {
    return 42;
  },
  async async_bar() {
    return 42;
  },
  // ❌ error
  async AsyncBar() {
    return 42;
  },
  // ❌ error
  AsyncBar2: async () => {
    return 42;
  },
  // ❌ error
  AsyncBar3: async function () {
    return 42;
  },
};
      `,
      errors: [
        {
          column: 9,
          data: {
            formats: 'snake_case',
            name: 'AsyncBar',
            type: 'Object Literal Method',
          },
          endColumn: 17,
          endLine: 10,
          line: 10,
          messageId: 'doesNotMatchFormat',
        },
        {
          column: 3,
          data: {
            formats: 'snake_case',
            name: 'AsyncBar2',
            type: 'Object Literal Method',
          },
          endColumn: 12,
          endLine: 14,
          line: 14,
          messageId: 'doesNotMatchFormat',
        },
        {
          column: 3,
          data: {
            formats: 'snake_case',
            name: 'AsyncBar3',
            type: 'Object Literal Method',
          },
          endColumn: 12,
          endLine: 18,
          line: 18,
          messageId: 'doesNotMatchFormat',
        },
      ],
      options: [
        {
          format: ['camelCase'],
          selector: 'memberLike',
        },
        {
          format: ['PascalCase'],
          selector: 'method',
        },
        {
          format: ['snake_case'],
          modifiers: ['async'],
          selector: ['method', 'objectLiteralMethod'],
        },
      ],
    },
    {
      code: `
const syncbar1 = () => {};
function syncBar2() {}
const syncBar3 = function syncBar4() {};

// ❌ error
const AsyncBar1 = async () => {};
const async_bar1 = async () => {};
const async_bar3 = async function async_bar4() {};
async function async_bar2() {}
// ❌ error
const asyncBar5 = async function async_bar6() {};
      `,
      errors: [
        {
          column: 7,
          data: {
            formats: 'snake_case',
            name: 'AsyncBar1',
            type: 'Variable',
          },
          endColumn: 16,
          endLine: 7,
          line: 7,
          messageId: 'doesNotMatchFormat',
        },
        {
          column: 7,
          data: {
            formats: 'snake_case',
            name: 'asyncBar5',
            type: 'Variable',
          },
          endColumn: 16,
          endLine: 12,
          line: 12,
          messageId: 'doesNotMatchFormat',
        },
      ],
      options: [
        {
          format: ['camelCase'],
          selector: 'variableLike',
        },
        {
          format: ['snake_case'],
          modifiers: ['async'],
          selector: ['variableLike'],
        },
      ],
    },
    {
      code: `
const syncbar1 = () => {};
function syncBar2() {}
const syncBar3 = function syncBar4() {};

const async_bar1 = async () => {};
// ❌ error
async function asyncBar2() {}
const async_bar3 = async function async_bar4() {};
async function async_bar2() {}
// ❌ error
const async_bar3 = async function ASYNC_BAR4() {};
      `,
      errors: [
        {
          column: 16,
          data: {
            formats: 'snake_case',
            name: 'asyncBar2',
            type: 'Function',
          },
          endColumn: 25,
          endLine: 8,
          line: 8,
          messageId: 'doesNotMatchFormat',
        },
        {
          column: 35,
          data: {
            formats: 'snake_case',
            name: 'ASYNC_BAR4',
            type: 'Function',
          },
          endColumn: 45,
          endLine: 12,
          line: 12,
          messageId: 'doesNotMatchFormat',
        },
      ],
      options: [
        {
          format: ['camelCase'],
          selector: 'variableLike',
        },
        {
          format: ['snake_case'],
          modifiers: ['async'],
          selector: ['variableLike'],
        },
      ],
    },
    {
      code: `
class foo extends bar {
  public someAttribute = 1;
  public override some_attribute_override = 1;
  // ❌ error
  public override someAttributeOverride = 1;
}
      `,
      errors: [
        {
          column: 19,
          data: {
            formats: 'snake_case',
            name: 'someAttributeOverride',
            type: 'Class Property',
          },
          endColumn: 40,
          endLine: 6,
          line: 6,
          messageId: 'doesNotMatchFormat',
        },
      ],
      options: [
        {
          format: ['camelCase'],
          selector: 'memberLike',
        },
        {
          format: ['snake_case'],
          modifiers: ['override'],
          selector: ['memberLike'],
        },
      ],
    },
    {
      code: `
class foo extends bar {
  public override some_method_override() {
    return 42;
  }
  // ❌ error
  public override someMethodOverride() {
    return 42;
  }
}
      `,
      errors: [
        {
          column: 19,
          data: {
            formats: 'snake_case',
            name: 'someMethodOverride',
            type: 'Class Method',
          },
          endColumn: 37,
          endLine: 7,
          line: 7,
          messageId: 'doesNotMatchFormat',
        },
      ],
      options: [
        {
          format: ['camelCase'],
          selector: 'memberLike',
        },
        {
          format: ['snake_case'],
          modifiers: ['override'],
          selector: ['memberLike'],
        },
      ],
    },
    {
      code: `
class foo extends bar {
  public get someGetter(): string;
  public override get some_getter_override(): string;
  // ❌ error
  public override get someGetterOverride(): string;
  public set someSetter(val: string);
  public override set some_setter_override(val: string);
  // ❌ error
  public override set someSetterOverride(val: string);
}
      `,
      errors: [
        {
          column: 23,
          data: {
            formats: 'snake_case',
            name: 'someGetterOverride',
            type: 'Classic Accessor',
          },
          endColumn: 41,
          endLine: 6,
          line: 6,
          messageId: 'doesNotMatchFormat',
        },
        {
          column: 23,
          data: {
            formats: 'snake_case',
            name: 'someSetterOverride',
            type: 'Classic Accessor',
          },
          endColumn: 41,
          endLine: 10,
          line: 10,
          messageId: 'doesNotMatchFormat',
        },
      ],
      options: [
        {
          format: ['camelCase'],
          selector: 'memberLike',
        },
        {
          format: ['snake_case'],
          modifiers: ['override'],
          selector: ['memberLike'],
        },
      ],
    },
    {
      code: `
class foo {
  private firstPrivateField = 1;
  // ❌ error
  private first_private_field = 1;
  // ❌ error
  #secondPrivateField = 1;
  #second_private_field = 1;
}
      `,
      errors: [
        {
          column: 11,
          data: {
            formats: 'camelCase',
            name: 'first_private_field',
            type: 'Class Property',
          },
          endColumn: 30,
          endLine: 5,
          line: 5,
          messageId: 'doesNotMatchFormat',
        },
        {
          column: 3,
          data: {
            formats: 'snake_case',
            name: 'secondPrivateField',
            type: 'Class Property',
          },
          endColumn: 22,
          endLine: 7,
          line: 7,
          messageId: 'doesNotMatchFormat',
        },
      ],
      options: [
        {
          format: ['camelCase'],
          selector: 'memberLike',
        },
        {
          format: ['snake_case'],
          modifiers: ['#private'],
          selector: ['memberLike'],
        },
      ],
    },
    {
      code: `
class foo {
  private firstPrivateMethod() {}
  // ❌ error
  private first_private_method() {}
  // ❌ error
  #secondPrivateMethod() {}
  #second_private_method() {}
}
      `,
      errors: [
        {
          column: 11,
          data: {
            formats: 'camelCase',
            name: 'first_private_method',
            type: 'Class Method',
          },
          endColumn: 31,
          endLine: 5,
          line: 5,
          messageId: 'doesNotMatchFormat',
        },
        {
          column: 3,
          data: {
            formats: 'snake_case',
            name: 'secondPrivateMethod',
            type: 'Class Method',
          },
          endColumn: 23,
          endLine: 7,
          line: 7,
          messageId: 'doesNotMatchFormat',
        },
      ],
      options: [
        {
          format: ['camelCase'],
          selector: 'memberLike',
        },
        {
          format: ['snake_case'],
          modifiers: ['#private'],
          selector: ['memberLike'],
        },
      ],
    },
    {
      code: "import * as fooBar from 'foo_bar';",
      errors: [
        {
          column: 13,
          data: {
            formats: 'PascalCase',
            name: 'fooBar',
            type: 'Import',
          },
          endColumn: 19,
          endLine: 1,
          line: 1,
          messageId: 'doesNotMatchFormat',
        },
      ],
      options: [
        {
          format: ['camelCase'],
          selector: ['import'],
        },
        {
          format: ['PascalCase'],
          modifiers: ['namespace'],
          selector: ['import'],
        },
      ],
    },
    {
      code: "import FooBar from 'foo_bar';",
      errors: [
        {
          column: 8,
          data: {
            formats: 'camelCase',
            name: 'FooBar',
            type: 'Import',
          },
          endColumn: 14,
          endLine: 1,
          line: 1,
          messageId: 'doesNotMatchFormat',
        },
      ],
      options: [
        {
          format: ['camelCase'],
          selector: ['import'],
        },
        {
          format: ['PascalCase'],
          modifiers: ['namespace'],
          selector: ['import'],
        },
      ],
    },
    {
      code: "import { default as foo_bar } from 'foo_bar';",
      errors: [
        {
          column: 21,
          data: {
            formats: 'camelCase',
            name: 'foo_bar',
            type: 'Import',
          },
          endColumn: 28,
          endLine: 1,
          line: 1,
          messageId: 'doesNotMatchFormat',
        },
      ],
      options: [
        {
          format: ['camelCase'],
          selector: ['import'],
        },
        {
          format: ['PascalCase'],
          modifiers: ['namespace'],
          selector: ['import'],
        },
      ],
    },
    {
      code: "import { '🍎' as foo } from 'foo_bar';",
      errors: [
        {
          column: 18,
          data: {
            formats: 'PascalCase',
            name: 'foo',
            type: 'Import',
          },
          endColumn: 21,
          endLine: 1,
          line: 1,
          messageId: 'doesNotMatchFormat',
        },
      ],
      options: [
        {
          format: ['PascalCase'],
          selector: ['import'],
        },
      ],
    },
  ],
})
