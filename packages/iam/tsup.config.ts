import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

export default defineConfig({
  ...baseConfig,
  entry: {
    'index': 'src/index.ts',
    'browser': 'src/iam-index.browser.ts',
    'client/index': 'src/client/index.ts',
  },
  external: ['@hai/core', '@hai/crypto', '@hai/db', '@hai/cache'],
})
