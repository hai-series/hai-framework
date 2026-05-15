import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

export default defineConfig({
  ...baseConfig,
  entry: {
    'index': 'src/index.ts',
    'features/iam': 'src/features/iam.ts',
    'features/storage': 'src/features/storage.ts',
    'features/ai': 'src/features/ai.ts',
  },
  external: [
    '@h-ai/ai',
    '@h-ai/api-contract',
    '@h-ai/core',
    '@h-ai/iam',
    '@h-ai/storage',
    '@orpc/openapi',
    '@orpc/server',
    'hono',
    'zod',
  ],
})
