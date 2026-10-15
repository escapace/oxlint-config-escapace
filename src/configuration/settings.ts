/** Plugin-wide settings shared by several rules; the same object goes to both engines (Oxlint passes `settings` to JS plugins). */
export const settings = {
  perfectionist: {
    ignoreCase: true,
    partitionByComment: true,
    partitionByNewLine: true,
    type: 'alphabetical',
  },
} as const
