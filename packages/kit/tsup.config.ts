import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

export default defineConfig({
  ...baseConfig,
  entry: [
    'src/index.ts',
    'src/client/index.ts',
    'src/modules/crypto/index.ts',
    'src/vite/index.ts',
    'src/adapter/index.ts',
  ],
  external: ['@sveltejs/kit', '@sveltejs/adapter-node', '@sveltejs/adapter-static', '@h-ai/core', 'zod'],
})
