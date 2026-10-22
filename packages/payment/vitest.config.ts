import { fileURLToPath } from 'node:url'
import { mergeConfig } from 'vitest/config'
import { baseTestConfig } from '../vitest.base'

export default mergeConfig(baseTestConfig, {
  resolve: {
    alias: {
      '@h-ai/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
    },
  },
})
