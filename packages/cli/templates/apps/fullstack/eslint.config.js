import antfu from '@antfu/eslint-config'

export default antfu({
  formatters: true,
  ignores: [
    '**/.svelte-kit/**',
    '**/build/**',
    '**/dist/**',
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
})
