/*! Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
 * See ./LICENSE for license information.
 */

import { TextRange } from '@microsoft/tsdoc'
import type { SourceCode } from 'eslint'

export type SourceComment = ReturnType<SourceCode['getAllComments']>[number]

export const getTsDocumentTextRange = (
  sourceCode: Pick<SourceCode, 'text'>,
  comment: SourceComment,
): TextRange | undefined => {
  if (comment.type !== 'Block') {
    return undefined
  }
  if (comment.range === undefined) {
    return undefined
  }

  const textRange: TextRange = TextRange.fromStringRange(
    sourceCode.text,
    comment.range[0],
    comment.range[1],
  )

  // Smallest comment is "/***/".
  if (textRange.length < 5) {
    return undefined
  }
  // Make sure it starts with "/**".
  if (textRange.buffer[textRange.pos + 2] !== '*') {
    return undefined
  }

  return textRange
}
