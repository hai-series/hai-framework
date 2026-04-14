/**
 * ESLint 配置
 *
 * @see https://github.com/antfu/eslint-config
 */

import antfu from '@antfu/eslint-config'

export default antfu({
  formatters: true,
  ignores: [
    '**/.svelte-kit/**',
    '**/build/**',
    '**/*.d.ts',
    '**/project.inlang/**',
    '**/paraglide/**',
    '**/.agents/**',
  ],
  svelte: true,
}, {
  files: ['**/*.ts', '**/*.svelte'],
  rules: {
    'no-console': 'error',
    'ts/no-explicit-any': 'error',
  },
})
