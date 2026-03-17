import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

export default defineConfig({
  ...baseConfig,
  entry: {
    'index': 'src/index.ts',
    'browser': 'src/iam-index.browser.ts',
    'api/index': 'src/api/index.ts',
  },
  external: ['@h-ai/core', '@h-ai/audit', '@h-ai/crypto', '@h-ai/reldb', '@h-ai/cache', 'zod'],
})
