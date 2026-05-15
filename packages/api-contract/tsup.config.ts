import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

export default defineConfig({
  ...baseConfig,
  entry: {
    'index': 'src/index.ts',
    'iam/index': 'src/iam/index.ts',
    'storage/index': 'src/storage/index.ts',
    'ai/index': 'src/ai/index.ts',
    'payment/index': 'src/payment/index.ts',
    'presets/api-service-contract': 'src/presets/api-service-contract.ts',
  },
  external: ['@h-ai/core', '@orpc/contract', 'zod'],
})
