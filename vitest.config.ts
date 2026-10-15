import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      // plugin shims only run bundled (they deep-import plugin internals); test/bundle.spec.ts covers them
      exclude: [
        'src/engines/oxlint/plugins/**',
        'src/generated/**',
        'src/vendor/**',
        ...(configDefaults.coverage.exclude ?? []),
      ],
      include: ['src/**'],
      provider: 'v8',
    },
    environment: 'node',
    include: ['{src,test}/**/*.spec.ts'],
    passWithNoTests: true,
    reporters: ['minimal'],
    sequence: { hooks: 'list' },
  },
})
