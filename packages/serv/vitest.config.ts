import { defineConfig } from 'vitest/config'
import { baseTestConfig } from '../vitest.base'

export default defineConfig({
  ...baseTestConfig,
  resolve: {
    alias: {
      '@h-ai/api-contract': '../api-contract/src/index.ts',
      '@h-ai/core': '../core/src/index.ts',
    },
  },
})
