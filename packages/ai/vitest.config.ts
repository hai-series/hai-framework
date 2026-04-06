import { mergeConfig } from 'vitest/config'
import { baseTestConfig } from '../vitest.base'

export default mergeConfig(baseTestConfig, {
  test: {
    setupFiles: ['./tests/setup.ts'],
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      '@h-ai/core': '../core/src/index.ts',
      '@h-ai/vecdb': '../vecdb/src/index.ts',
      '@h-ai/reldb': '../reldb/src/index.ts',
      '@h-ai/datapipe': '../datapipe/src/index.ts',
    },
  },
})
