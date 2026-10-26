import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

export default defineConfig({
  ...baseConfig,
  entry: {
    'index': 'src/index.ts',
    'features/iam': 'src/features/serv-feature-iam.ts',
    'features/storage': 'src/features/serv-feature-storage.ts',
    'features/ai': 'src/features/serv-feature-ai.ts',
    'features/feedback': 'src/features/serv-feature-feedback.ts',
  },
  external: [
    '@h-ai/ai',
    '@h-ai/api-contract',
    '@h-ai/audit',
    '@h-ai/core',
    '@h-ai/crypto',
    '@h-ai/feedback',
    '@h-ai/iam',
    '@h-ai/storage',
    '@orpc/openapi',
    '@orpc/server',
    'hono',
    'zod',
  ],
})
