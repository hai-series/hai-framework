import { defineConfig } from 'vitest/config'
import { baseTestConfig } from '../vitest.base.ts'

export default defineConfig({
  ...baseTestConfig,
  resolve: {
    alias: {
      '@h-ai/api-contract/feedback': '../api-contract/src/feedback/index.ts',
      '@h-ai/api-contract': '../api-contract/src/index.ts',
      '@h-ai/core': '../core/src/index.ts',
    },
  },
})
