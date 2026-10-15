/*! Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
 * See ./LICENSE for license information.
 */

interface Program {
  getCompilerOptions: () => { baseUrl?: string | undefined }
  getCurrentDirectory: () => string
}

/** The members of a rule context the lookup reads; ESLint's, typescript-eslint's and Oxlint's all have them. */
export interface RuleContext {
  languageOptions: { parserOptions?: object | undefined }
  sourceCode: { parserServices?: { program?: Program | null | undefined } | null | undefined }
  cwd?: string | undefined
  getCwd?: (() => string) | undefined
  parserOptions?: object | undefined
}

const tsconfigRootDirectory = (parserOptions: object | undefined): string | undefined =>
  parserOptions !== undefined &&
  'tsconfigRootDir' in parserOptions &&
  typeof parserOptions.tsconfigRootDir === 'string'
    ? parserOptions.tsconfigRootDir
    : undefined

export const getRootDirectoryFromContext = (context: RuleContext): string | undefined => {
  let rootDirectory: string | undefined
  try {
    // Prefer type-aware parser services when available because they reflect the active TypeScript project.
    // (Upstream falls back to `ESLintUtils.getParserServices`, which throws whenever these are missing.)
    const program = context.sourceCode.parserServices?.program
    rootDirectory = program?.getCompilerOptions().baseUrl ?? program?.getCurrentDirectory()
  } catch {
    // Ignore the error if we cannot retrieve a TypeScript program.
  }

  // Fallback precedence preserves upstream compatibility: flat config, legacy config, cwd property, cwd method.
  if (rootDirectory === undefined || rootDirectory === '') {
    rootDirectory =
      tsconfigRootDirectory(context.languageOptions.parserOptions) ??
      tsconfigRootDirectory(context.parserOptions) ??
      context.cwd ??
      context.getCwd?.()
  }

  return rootDirectory
}
