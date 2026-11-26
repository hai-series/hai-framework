import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

export default defineConfig({
  ...baseConfig,
  entry: ['src/index.ts'],
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
