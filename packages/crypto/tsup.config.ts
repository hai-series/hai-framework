import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

export default defineConfig({
  ...baseConfig,
  entry: { index: 'src/index.ts' },
  external: [
    '@h-ai/cache',
    '@h-ai/core',
    'sm-crypto',
  ],
})
