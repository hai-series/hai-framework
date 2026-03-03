import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

export default defineConfig({
  ...baseConfig,
  entry: [
    'src/index.ts',
    'src/client/index.ts',
    'src/modules/crypto/index.ts',
    'src/vite/index.ts',
  ],
  external: ['@sveltejs/kit', '@h-ai/core', 'zod'],
})
