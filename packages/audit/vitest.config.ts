import { mergeConfig } from 'vitest/config'
import { baseTestConfig } from '../vitest.base'

export default mergeConfig(baseTestConfig, {
  resolve: {
    alias: {
      '@h-ai/core': '../core/src/index.ts',
      '@h-ai/db': '../db/src/index.ts',
    },
  },
})
