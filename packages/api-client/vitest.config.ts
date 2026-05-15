import { mergeConfig } from 'vitest/config'
import { baseTestConfig } from '../vitest.base'

export default mergeConfig(baseTestConfig, {
  resolve: {
    alias: {
      '@h-ai/api-contract/presets/api-service': '../api-contract/src/presets/api-service-contract.ts',
      '@h-ai/api-contract/ai': '../api-contract/src/ai/index.ts',
      '@h-ai/api-contract/iam': '../api-contract/src/iam/index.ts',
      '@h-ai/api-contract/payment': '../api-contract/src/payment/index.ts',
      '@h-ai/api-contract/storage': '../api-contract/src/storage/index.ts',
      '@h-ai/api-contract': '../api-contract/src/index.ts',
      '@h-ai/core': '../core/src/index.ts',
    },
  },
})
