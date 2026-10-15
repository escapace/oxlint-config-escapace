/** Paths no consumer wants linted; merged with `.lintignore`, `.eslintignore` and `.gitignore` at runtime. */
export const ignorePatterns: readonly string[] = [
  '**/fish_history',

  '**/bun.lockb',
  '**/dist/',
  '**/node_modules/',
  '**/package-lock.json',
  '**/pnpm-lock.yaml',
  '**/yarn.lock',
  '**/lake-manifest.json',

  '**/.cache/',
  '**/.changeset/',
  '**/.firecrawl/',
  '**/.history/',
  '**/.idea/',
  '**/.next/',
  '**/.nuxt/',
  // Nuxt UI's theme templates, when its `root` option moves them out of node_modules
  '**/.nuxt-ui/',
  '**/.output/',
  '**/.vercel/',
  '**/.vite-inspect/',
  '**/.vitepress/cache/',
  '**/.wrangler/',
  '**/.yarn/',
  '**/coverage/',

  '**/*.min.*',
  '**/CHANGELOG*.md',
  '**/LICENSE*',
  '**/__snapshots__/',
  // declarations unplugin-auto-import, unplugin-vue-components (also through Nuxt UI) and
  // unplugin-vue-router regenerate; their `eslint-disable` header no longer reaches Oxlint
  '**/auto-import.d.ts',
  '**/auto-imports.d.ts',
  '**/components.d.ts',
  '**/typed-router.d.ts',
]

/** Ignore files read from the consumer's working directory, in this order. */
export const ignoreFiles: readonly string[] = ['.eslintignore', '.lintignore']
