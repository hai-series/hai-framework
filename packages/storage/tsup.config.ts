import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

export default defineConfig({
  ...baseConfig,
  entry: {
    'node': 'src/index.ts',
    'browser': 'src/storage-index.browser.ts',
    'client/index': 'src/client/index.ts',
  },
  external: [
    '@hai/core',
    '@aws-sdk/client-s3',
    '@aws-sdk/s3-request-presigner',
    '@aws-sdk/lib-storage',
    'zod',
  ],
})
