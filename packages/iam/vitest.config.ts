import { mergeConfig } from 'vitest/config'
import { baseTestConfig } from '../vitest.base'

export default mergeConfig(baseTestConfig, {
  resolve: {
    alias: {
      '@hai/cache': '../cache/src/index.ts',
      '@hai/core': '../core/src/index.ts',
      '@hai/crypto': '../crypto/src/index.ts',
      '@hai/db': '../db/src/index.ts',
    },
  },
})
