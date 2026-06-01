import antfu from '@antfu/eslint-config'

export default antfu({
  formatters: true,
  ignores: [
    '**/build/**',
    '**/dist/**',
    '**/src/lib/paraglide/**',
    '**/project.inlang/**',
    '**/*.d.ts',
    '**/.agents/**',
    '**/.github/**',
    '**/AGENTS.md',
    '**/CLAUDE.md',
    '**/README.md',
    '**/opencode.json',
    '**/package.json',
  ],
  svelte: true,
}, {
  files: ['**/*.ts', '**/*.svelte'],
  rules: {
    'no-console': 'error',
    'ts/no-explicit-any': 'error',
  },
}, {
  files: ['**/*.svelte'],
  rules: {
    'svelte/html-quotes': 'off',
    'svelte/indent': 'off',
    'perfectionist/sort-imports': 'off',
  },
}, {
  files: ['**/tsconfig.json', '**/tsconfig.*.json'],
  rules: {
    'jsonc/sort-keys': 'off',
  },
}, {
  files: ['**/index.ts'],
  rules: {
    'perfectionist/sort-exports': 'off',
  },
})
