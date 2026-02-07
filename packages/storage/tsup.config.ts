import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

export default defineConfig({
  ...baseConfig,
  entry: {
    'node': 'src/storage-index.node.ts',
    'browser': 'src/storage-index.browser.ts',
    'storage-client': 'src/storage-client.ts',
  },
  external: [
    '@hai/core',
    '@aws-sdk/client-s3',
    '@aws-sdk/s3-request-presigner',
    '@aws-sdk/lib-storage',
    'zod',
  ],
})
