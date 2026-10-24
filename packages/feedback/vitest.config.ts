import { fileURLToPath } from 'node:url'
import { mergeConfig } from 'vitest/config'
import { baseTestConfig } from '../vitest.base.ts'

export default mergeConfig(baseTestConfig, {
  resolve: {
    alias: {
      '@h-ai/api-contract/feedback': fileURLToPath(new URL('../api-contract/src/feedback/index.ts', import.meta.url)),
      '@h-ai/api-contract': fileURLToPath(new URL('../api-contract/src/index.ts', import.meta.url)),
      '@h-ai/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
      '@h-ai/reldb': fileURLToPath(new URL('../reldb/src/index.ts', import.meta.url)),
      '@h-ai/storage': fileURLToPath(new URL('../storage/src/index.ts', import.meta.url)),
      '@h-ai/reach': fileURLToPath(new URL('../reach/src/index.ts', import.meta.url)),
    },
  },
})
