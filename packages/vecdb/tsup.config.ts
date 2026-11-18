import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

export default defineConfig({
  ...baseConfig,
  entry: {
    'index': 'src/index.ts',
    'vecdb-provider-worker': 'src/providers/vecdb-provider-worker.ts',
  },
  external: [
    '@h-ai/core',
    '@lancedb/lancedb',
    'chromadb',
    'pg',
    'zod',
  ],
})
