import { expect, it } from 'vitest'

import { ensureDefined } from './ensure-defined.ts'

it('returns defined root value', { timeout: 60_000 }, () => {
  expect(ensureDefined('value')).toBe('value')
})

it('returns defined nested value', { timeout: 60_000 }, () => {
  expect(ensureDefined({ a: { b: 'value' } }, 'a', 'b')).toBe('value')
})

it('throws for missing nested value', { timeout: 60_000 }, () => {
  expect(() => ensureDefined({ a: {} }, 'a', 'b')).toThrow(
    'Expected value at path "a.b" to be defined',
  )
})
