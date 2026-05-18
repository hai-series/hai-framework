import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

export default defineConfig({
  ...baseConfig,
  entry: {
    'index': 'src/index.ts',
    'features/iam': 'src/features/serv-feature-iam.ts',
    'features/storage': 'src/features/serv-feature-storage.ts',
    'features/ai': 'src/features/serv-feature-ai.ts',
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
