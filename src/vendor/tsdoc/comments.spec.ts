/*! Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
 * See ./LICENSE for license information.
 */

import type { SourceCode } from 'eslint'
import { describe, expect, it } from 'vitest'

import { getTsDocumentTextRange, type SourceComment } from './comments.ts'

const createSourceCode = (text: string): Pick<SourceCode, 'text'> => ({ text })

const createComment = (comment: Partial<SourceComment>): SourceComment => ({
  type: 'Block',
  value: '',
  ...comment,
})

describe('getTsDocumentTextRange', () => {
  it('skips line comments', { timeout: 60_000 }, () => {
    expect(
      getTsDocumentTextRange(
        createSourceCode('// hello'),
        createComment({ range: [0, 8], type: 'Line' }),
      ),
    ).toBeUndefined()
  })

  it('skips comments without ranges', { timeout: 60_000 }, () => {
    expect(
      getTsDocumentTextRange(createSourceCode('/** hello */'), createComment({})),
    ).toBeUndefined()
  })

  it('skips block comments that are too short to be TSDoc comments', { timeout: 60_000 }, () => {
    expect(
      getTsDocumentTextRange(createSourceCode('/**/'), createComment({ range: [0, 4] })),
    ).toBeUndefined()
  })

  it('skips non-TSDoc block comments', { timeout: 60_000 }, () => {
    expect(
      getTsDocumentTextRange(createSourceCode('/* hello */'), createComment({ range: [0, 11] })),
    ).toBeUndefined()
  })

  it('returns text ranges for TSDoc comments', { timeout: 60_000 }, () => {
    const textRange = getTsDocumentTextRange(
      createSourceCode('/** hello */'),
      createComment({ range: [0, 12] }),
    )

    expect(textRange?.toString()).toBe('/** hello */')
  })
})
