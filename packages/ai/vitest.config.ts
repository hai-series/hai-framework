import { resolve } from 'node:path'
import { mergeConfig } from 'vitest/config'
import { baseTestConfig } from '../vitest.base'

export default mergeConfig(baseTestConfig, {
  resolve: {
    alias: {
      '@hai/core': resolve(__dirname, '../core/src/index.ts'),
    },
  },
})
