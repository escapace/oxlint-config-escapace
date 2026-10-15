/*
 * One accessibility policy for all the markup this package lints: JSX and TSX
 * (Oxlint's `jsx-a11y`), Astro templates (`astro/jsx-a11y/*`) and Vue
 * templates (`vue-a11y`). Keys are rule names without a plugin; codegen gives
 * each plugin the rules it has, under its own prefix. Entries hold a severity
 * only: the plugins' options differ in shape, so each keeps the options of its
 * own preset. The base is the union of jsx-a11y's and vuejs-accessibility's
 * `recommended` presets.
 */
import type { RuleSeverityInput } from '../types.ts'

export const rulesAccessibility: Readonly<Record<string, RuleSeverityInput>> = {
  'alt-text': 'error',
  // "click here" and similar link text; too often the design's choice
  'anchor-ambiguous-text': 'off',
  'anchor-has-content': 'error',
  'anchor-is-valid': 'error',
  'aria-activedescendant-has-tabindex': 'error',
  'aria-props': 'error',
  'aria-proptypes': 'error',
  'aria-role': 'error',
  'aria-unsupported-elements': 'error',
  // axe-core, which it runs, is too large to bundle for Astro; it checks only the spelling of
  // autofill values
  'autocomplete-valid': 'off',
  'click-events-have-key-events': 'error',
  // label-has-associated-control and Vue's form-control-has-label cover form controls
  'control-has-associated-label': 'off',
  // Vue only
  'form-control-has-label': 'error',
  'heading-has-content': 'error',
  'html-has-lang': 'error',
  'iframe-has-title': 'error',
  'img-redundant-alt': 'error',
  'interactive-supports-focus': 'error',
  'label-has-associated-control': 'error',
  // Vue only; jsx-a11y deprecated it for label-has-associated-control
  'label-has-for': 'error',
  // the language registry it needs is too large to bundle for Astro; a project sets `lang` once
  'lang': 'off',
  'media-has-caption': 'error',
  'mouse-events-have-key-events': 'error',
  'no-access-key': 'error',
  // beyond the presets: a focusable element hidden from assistive technology
  'no-aria-hidden-on-focusable': 'error',
  'no-autofocus': 'error',
  'no-distracting-elements': 'error',
  'no-interactive-element-to-noninteractive-role': 'error',
  'no-noninteractive-element-interactions': 'error',
  'no-noninteractive-element-to-interactive-role': 'error',
  'no-noninteractive-tabindex': 'error',
  'no-redundant-roles': 'error',
  // Vue only, beyond its preset: the same mistake as no-aria-hidden-on-focusable
  'no-role-presentation-on-focusable': 'error',
  'no-static-element-interactions': 'error',
  // a style preference among valid markup
  'prefer-tag-over-role': 'off',
  'role-has-required-aria-props': 'error',
  'role-supports-aria-props': 'error',
  'scope': 'error',
  'tabindex-no-positive': 'error',
}
