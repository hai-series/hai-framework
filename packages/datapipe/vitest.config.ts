import { mergeConfig } from 'vitest/config'
import { baseTestConfig } from '../vitest.base.ts'

export default mergeConfig(baseTestConfig, {
  resolve: {
    alias: {
      '@h-ai/core': '../core/src/index.ts',
    },
  },
})
