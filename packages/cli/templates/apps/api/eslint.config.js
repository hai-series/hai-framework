import antfu from '@antfu/eslint-config'

export default antfu({
  formatters: true,
  ignores: [
    '**/dist/**',
    '**/node_modules/**',
    '**/.agents/**',
    '**/.github/**',
    '**/AGENTS.md',
    '**/CLAUDE.md',
    '**/README.md',
    '**/opencode.json',
    '**/package.json',
  ],
}, {
  files: ['**/*.js', '**/*.mjs', '**/*.ts'],
  rules: {
    'no-console': 'error',
    'ts/no-explicit-any': 'error',
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
