import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

export default defineConfig({
  ...baseConfig,
  entry: [
    'src/index.ts',
    'src/modules/iam/index.ts',
    'src/modules/storage/index.ts',
    'src/modules/cache/index.ts',
    'src/modules/crypto/index.ts',
    'src/client/index.ts',
  ],
  external: ['@sveltejs/kit', '@h-ai/core', '@h-ai/iam', 'svelte', 'svelte/store'],
})
