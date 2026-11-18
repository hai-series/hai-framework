import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

export default defineConfig({
  ...baseConfig,
  entry: {
    'index': 'src/index.ts',
    'browser': 'src/browser.ts',
    'crypto-password-worker': 'src/crypto-password-worker.ts',
    'crypto-transport-worker': 'src/transport/crypto-transport-worker.ts',
  },
  external: [
    '@h-ai/cache',
    '@h-ai/core',
    'sm-crypto',
  ],
})
