/*
 * typescript-eslint's RuleTester, wired to vitest's hooks; the ported specs
 * import it from here instead of setting the hooks themselves.
 */
import { RuleTester } from '@typescript-eslint/rule-tester'
import { afterAll, describe, it } from 'vitest'

RuleTester.afterAll = afterAll
RuleTester.describe = describe
RuleTester.it = it
RuleTester.itOnly = it.only

export { noFormat, RuleTester } from '@typescript-eslint/rule-tester'
