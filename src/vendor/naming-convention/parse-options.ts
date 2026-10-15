import type { Context, NormalizedSelector, ParsedOptions, Selector } from './types.ts'

import {
  getEnumNames,
  MetaSelectors,
  Modifiers,
  PredefinedFormats,
  Selectors,
  TypeModifiers,
  UnderscoreOptions,
} from './enums.ts'
import { isMetaSelector } from './shared.ts'
import { createValidator } from './validator.ts'

function normalizeOption(option: Selector): NormalizedSelector[] {
  // Local adaptation: `types` needs the TypeScript type checker, which Oxlint's JS plugins never
  // receive; upstream would fail when linting. Fail when the options are read, with the reason.
  if (option.types !== undefined && option.types.length > 0) {
    throw new Error(
      'escapace/naming-convention: the `types` option needs type information, which Oxlint does not give JS plugins; select by name with `filter` instead',
    )
  }

  let weight = 0
  option.modifiers?.forEach((mod) => {
    weight |= Modifiers[mod]
  })
  option.types?.forEach((mod) => {
    weight |= TypeModifiers[mod]
  })

  // give selectors with a filter the _highest_ priority
  if (option.filter) {
    weight |= 1 << 30
  }

  const normalizedOption = {
    // format options
    custom: option.custom
      ? {
          match: option.custom.match,
          regex: new RegExp(option.custom.regex, 'u'),
        }
      : null,
    filter:
      option.filter != null
        ? typeof option.filter === 'string'
          ? {
              match: true,
              regex: new RegExp(option.filter, 'u'),
            }
          : {
              match: option.filter.match,
              regex: new RegExp(option.filter.regex, 'u'),
            }
        : null,
    format: option.format ? option.format.map((f) => PredefinedFormats[f]) : null,
    leadingUnderscore:
      option.leadingUnderscore != null ? UnderscoreOptions[option.leadingUnderscore] : null,
    modifiers: option.modifiers?.map((m) => Modifiers[m]) ?? null,
    prefix: option.prefix && option.prefix.length > 0 ? option.prefix : null,
    suffix: option.suffix && option.suffix.length > 0 ? option.suffix : null,
    trailingUnderscore:
      option.trailingUnderscore != null ? UnderscoreOptions[option.trailingUnderscore] : null,
    types: option.types?.map((m) => TypeModifiers[m]) ?? null,
    // calculated ordering weight based on modifiers
    modifierWeight: weight,
  }

  const selectors = Array.isArray(option.selector) ? option.selector : [option.selector]

  return selectors.map((selector) => ({
    selector: isMetaSelector(selector) ? MetaSelectors[selector] : Selectors[selector],
    ...normalizedOption,
  }))
}

export function parseOptions(context: Context): ParsedOptions {
  const normalizedOptions = context.options.flatMap(normalizeOption)

  return Object.fromEntries(
    getEnumNames(Selectors).map((k) => [k, createValidator(k, context, normalizedOptions)]),
  ) as ParsedOptions
}
