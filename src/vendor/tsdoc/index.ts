/*! Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
 * See ./LICENSE for license information.
 */

import type { Rule } from 'eslint'
import { createSyntaxRule } from './rule.ts'

interface Plugin {
  rules: { syntax: Rule.RuleModule }
}

const plugin: Plugin = {
  rules: {
    // NOTE: The actual ESLint rule name will be "tsdoc/syntax". It is calculated by deleting "eslint-plugin-"
    // from the NPM package name, and then appending this string.
    syntax: createSyntaxRule(),
  },
}

export default plugin
