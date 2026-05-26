import { defineConfig } from 'tsup'
import { baseConfig } from '../../packages/tsup.base'

export default defineConfig({
  ...baseConfig,
  entry: { index: 'src/index.ts' },
  external: ['@h-ai/api-contract', 'zod'],
})
