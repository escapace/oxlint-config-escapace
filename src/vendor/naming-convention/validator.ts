import type { TSESTree } from '@typescript-eslint/utils'

import { AST_NODE_TYPES } from '@typescript-eslint/utils'

import type { SelectorsString } from './enums.ts'
import type { Context, NormalizedSelector, ValidatorFunction } from './types.ts'

import {
  MetaSelectors,
  Modifiers,
  PredefinedFormats,
  Selectors,
  UnderscoreOptions,
} from './enums.ts'
import { PredefinedFormatToCheckFunction } from './format.ts'
import {
  isMetaSelector,
  isMethodOrPropertySelector,
  selectorTypeToMessageString,
} from './shared.ts'

export function createValidator(
  type: SelectorsString,
  context: Context,
  allConfigs: NormalizedSelector[],
): ValidatorFunction {
  // make sure the "highest priority" configs are checked first
  const selectorType = Selectors[type]
  const configs = allConfigs
    // gather all of the applicable selectors
    .filter((c) => (c.selector & selectorType) !== 0 || c.selector === MetaSelectors.default)
    .sort((a, b) => {
      if (a.selector === b.selector) {
        // in the event of the same selector, order by modifier weight
        // sort descending - the type modifiers are "more important"
        return b.modifierWeight - a.modifierWeight
      }

      const aIsMeta = isMetaSelector(a.selector)
      const bIsMeta = isMetaSelector(b.selector)

      // non-meta selectors should go ahead of meta selectors
      if (aIsMeta && !bIsMeta) {
        return 1
      }
      if (!aIsMeta && bIsMeta) {
        return -1
      }

      const aIsMethodOrProperty = isMethodOrPropertySelector(a.selector)
      const bIsMethodOrProperty = isMethodOrPropertySelector(b.selector)

      // for backward compatibility, method and property have higher precedence than other meta selectors
      if (aIsMethodOrProperty && !bIsMethodOrProperty) {
        return -1
      }
      if (!aIsMethodOrProperty && bIsMethodOrProperty) {
        return 1
      }

      // both aren't meta selectors
      // sort descending - the meta selectors are "least important"
      return b.selector - a.selector
    })

  return (node, modifiers = new Set<Modifiers>()): void => {
    const originalName =
      node.type === AST_NODE_TYPES.Identifier || node.type === AST_NODE_TYPES.PrivateIdentifier
        ? node.name
        : `${node.value}`

    // return will break the loop and stop checking configs
    // it is only used when the name is known to have failed or succeeded a config.
    for (const config of configs) {
      if (config.filter?.regex.test(originalName) !== config.filter?.match) {
        // name does not match the filter
        continue
      }

      if (config.modifiers?.some((modifier) => !modifiers.has(modifier))) {
        // does not have the required modifiers
        continue
      }

      if (!isCorrectType(node, config, context, selectorType)) {
        // is not the correct type
        continue
      }

      let name: string | null = originalName

      name = validateUnderscore('leading', config, name, node, originalName)
      if (name == null) {
        // fail
        return
      }

      name = validateUnderscore('trailing', config, name, node, originalName)
      if (name == null) {
        // fail
        return
      }

      name = validateAffix('prefix', config, name, node, originalName)
      if (name == null) {
        // fail
        return
      }

      name = validateAffix('suffix', config, name, node, originalName)
      if (name == null) {
        // fail
        return
      }

      if (!validateCustom(config, name, node, originalName)) {
        // fail
        return
      }

      if (!validatePredefinedFormat(config, name, node, originalName, modifiers)) {
        // fail
        return
      }

      // it's valid for this config, so we don't need to check any more configs
      return
    }
  }

  // centralizes the logic for formatting the report data
  function formatReportData({
    affixes,
    count,
    custom,
    formats,
    originalName,
    position,
    processedName,
  }: {
    affixes?: string[]
    count?: 'one' | 'two'
    custom?: NonNullable<NormalizedSelector['custom']>
    formats?: PredefinedFormats[]
    originalName: string
    position?: 'leading' | 'prefix' | 'suffix' | 'trailing'
    processedName?: string
  }): Record<string, unknown> {
    return {
      affixes: affixes?.join(', '),
      count,
      formats: formats?.map((f) => PredefinedFormats[f]).join(', '),
      name: originalName,
      position,
      processedName,
      regex: custom?.regex.toString(),
      regexMatch: custom?.match === true ? 'match' : custom?.match === false ? 'not match' : null,
      type: selectorTypeToMessageString(type),
    }
  }

  /**
   * @returns the name with the underscore removed, if it is valid according to the specified underscore option, null otherwise
   */
  function validateUnderscore(
    position: 'leading' | 'trailing',
    config: NormalizedSelector,
    name: string,
    node: TSESTree.Identifier | TSESTree.Literal | TSESTree.PrivateIdentifier,
    originalName: string,
  ): string | null {
    const option = position === 'leading' ? config.leadingUnderscore : config.trailingUnderscore
    if (!option) {
      return name
    }

    const hasSingleUnderscore =
      position === 'leading'
        ? (): boolean => name.startsWith('_')
        : (): boolean => name.endsWith('_')
    const trimSingleUnderscore =
      position === 'leading' ? (): string => name.slice(1) : (): string => name.slice(0, -1)

    const hasDoubleUnderscore =
      position === 'leading'
        ? (): boolean => name.startsWith('__')
        : (): boolean => name.endsWith('__')
    const trimDoubleUnderscore =
      position === 'leading' ? (): string => name.slice(2) : (): string => name.slice(0, -2)

    switch (option) {
      // ALLOW - no conditions as the user doesn't care if it's there or not
      case UnderscoreOptions.allow: {
        if (hasSingleUnderscore()) {
          return trimSingleUnderscore()
        }

        return name
      }

      case UnderscoreOptions.allowDouble: {
        if (hasDoubleUnderscore()) {
          return trimDoubleUnderscore()
        }

        return name
      }

      case UnderscoreOptions.allowSingleOrDouble: {
        if (hasDoubleUnderscore()) {
          return trimDoubleUnderscore()
        }

        if (hasSingleUnderscore()) {
          return trimSingleUnderscore()
        }

        return name
      }

      // FORBID
      case UnderscoreOptions.forbid: {
        if (hasSingleUnderscore()) {
          context.report({
            data: formatReportData({
              count: 'one',
              originalName,
              position,
            }),
            messageId: 'unexpectedUnderscore',
            node,
          })
          return null
        }

        return name
      }

      // REQUIRE
      case UnderscoreOptions.require: {
        if (!hasSingleUnderscore()) {
          context.report({
            data: formatReportData({
              count: 'one',
              originalName,
              position,
            }),
            messageId: 'missingUnderscore',
            node,
          })
          return null
        }

        return trimSingleUnderscore()
      }

      case UnderscoreOptions.requireDouble: {
        if (!hasDoubleUnderscore()) {
          context.report({
            data: formatReportData({
              count: 'two',
              originalName,
              position,
            }),
            messageId: 'missingUnderscore',
            node,
          })
          return null
        }

        return trimDoubleUnderscore()
      }
    }
  }

  /**
   * @returns the name with the affix removed, if it is valid according to the specified affix option, null otherwise
   */
  function validateAffix(
    position: 'prefix' | 'suffix',
    config: NormalizedSelector,
    name: string,
    node: TSESTree.Identifier | TSESTree.Literal | TSESTree.PrivateIdentifier,
    originalName: string,
  ): string | null {
    const affixes = config[position]
    if (!affixes || affixes.length === 0) {
      return name
    }

    for (const affix of affixes) {
      const hasAffix = position === 'prefix' ? name.startsWith(affix) : name.endsWith(affix)
      const trimAffix =
        position === 'prefix'
          ? (): string => name.slice(affix.length)
          : (): string => name.slice(0, -affix.length)

      if (hasAffix) {
        // matches, so trim it and return
        return trimAffix()
      }
    }

    context.report({
      data: formatReportData({
        affixes,
        originalName,
        position,
      }),
      messageId: 'missingAffix',
      node,
    })
    return null
  }

  /**
   * @returns true if the name is valid according to the `regex` option, false otherwise
   */
  function validateCustom(
    config: NormalizedSelector,
    name: string,
    node: TSESTree.Identifier | TSESTree.Literal | TSESTree.PrivateIdentifier,
    originalName: string,
  ): boolean {
    const custom = config.custom
    if (!custom) {
      return true
    }

    const result = custom.regex.test(name)
    if (custom.match && result) {
      return true
    }
    if (!custom.match && !result) {
      return true
    }

    context.report({
      data: formatReportData({
        custom,
        originalName,
      }),
      messageId: 'satisfyCustom',
      node,
    })
    return false
  }

  /**
   * @returns true if the name is valid according to the `format` option, false otherwise
   */
  function validatePredefinedFormat(
    config: NormalizedSelector,
    name: string,
    node: TSESTree.Identifier | TSESTree.Literal | TSESTree.PrivateIdentifier,
    originalName: string,
    modifiers: Set<Modifiers>,
  ): boolean {
    const formats = config.format
    if (!formats?.length) {
      return true
    }

    if (!modifiers.has(Modifiers.requiresQuotes)) {
      for (const format of formats) {
        const checker = PredefinedFormatToCheckFunction[format]
        if (checker(name)) {
          return true
        }
      }
    }

    context.report({
      data: formatReportData({
        formats,
        originalName,
        processedName: name,
      }),
      messageId: originalName === name ? 'doesNotMatchFormat' : 'doesNotMatchFormatTrimmed',
      node,
    })
    return false
  }
}

/**
 * Local adaptation: upstream narrows selectors by the TypeScript type of the
 * name (`types`). Oxlint gives JS plugins no type information, so that option
 * is rejected when the options are read (`parse-options.ts`) and every
 * selector applies regardless of type.
 */
function isCorrectType(
  _node: TSESTree.Node,
  _config: NormalizedSelector,
  _context: Context,
  _selector: Selectors,
): boolean {
  return true
}
