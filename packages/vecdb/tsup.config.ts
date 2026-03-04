import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

export default defineConfig({
  ...baseConfig,
  entry: { index: 'src/index.ts' },
  external: ['@h-ai/core', '@lancedb/lancedb', '@qdrant/js-client-rest', 'pg', 'zod'],
})
