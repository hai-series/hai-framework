import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

export default defineConfig({
  ...baseConfig,
  entry: {
    'index': 'src/index.ts',
    'features/iam': 'src/features/serv-feature-iam-entry.ts',
    'features/storage': 'src/features/serv-feature-storage-entry.ts',
    'features/ai': 'src/features/serv-feature-ai-entry.ts',
    'features/feedback': 'src/features/serv-feature-feedback-entry.ts',
  },
  external: [
    '@h-ai/ai',
    '@h-ai/api-contract',
    '@h-ai/audit',
    '@h-ai/core',
    '@h-ai/crypto',
    '@h-ai/iam',
    '@h-ai/storage',
    '@orpc/contract',
    '@orpc/openapi',
    '@orpc/server',
    'hono',
    'zod',
  ],
})
