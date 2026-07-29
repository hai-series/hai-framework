import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

export default defineConfig({
  ...baseConfig,
  entry: { index: 'src/index.ts' },
  external: [
    '@h-ai/api-contract',
    '@h-ai/core',
    '@h-ai/crypto',
    '@orpc/client',
    '@orpc/contract',
    '@orpc/openapi-client',
    'zod',
  ],
})
