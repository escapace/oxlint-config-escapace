import { defineConfig } from 'oxfmt'

/*
 * The settings of `prettier-config-escapace`, which this package used before
 * oxfmt. `sortPackageJson` is off because Prettier never sorted package.json;
 * syncpack owns its order. The scripts pass the same object to oxfmt's API.
 */
export default defineConfig({
  arrowParens: 'always',
  bracketSameLine: false,
  bracketSpacing: true,
  htmlWhitespaceSensitivity: 'strict',
  ignorePatterns: [
    '.cache',
    '.firecrawl',
    'coverage',
    'lib',
    'pnpm-lock.yaml',
    'test/fixtures',
  ],
  printWidth: 100,
  quoteProps: 'consistent',
  semi: false,
  singleQuote: true,
  sortPackageJson: false,
  tabWidth: 2,
  trailingComma: 'all',
})
