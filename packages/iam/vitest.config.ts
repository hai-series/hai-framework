import { mergeConfig } from 'vitest/config'
import { baseTestConfig } from '../vitest.base'

export default mergeConfig(baseTestConfig, {
  resolve: {
    alias: {
      '@h-ai/cache': '../cache/src/index.ts',
      '@h-ai/core': '../core/src/index.ts',
      '@h-ai/crypto': '../crypto/src/index.ts',
      '@h-ai/reldb': '../reldb/src/index.ts',
    },
  },
})
