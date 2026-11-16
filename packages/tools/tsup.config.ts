import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

export default defineConfig({
  ...baseConfig,
  target: 'es2022',
  entry: { index: 'src/index.ts' },
  external: ['@h-ai/core', 'zod'],
})
