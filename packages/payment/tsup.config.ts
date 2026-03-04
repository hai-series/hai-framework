import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

export default defineConfig({
  ...baseConfig,
  entry: [
    'src/index.ts',
    'src/client/index.ts',
    'src/api/index.ts',
  ],
  external: ['@h-ai/core', 'zod'],
})
