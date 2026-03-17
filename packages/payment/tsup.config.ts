import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

export default defineConfig({
  ...baseConfig,
  entry: {
    'index': 'src/index.ts',
    'client/index': 'src/client/index.ts',
    'api/index': 'src/api/index.ts',
  },
  external: ['@h-ai/audit', '@h-ai/core', 'zod'],
})
