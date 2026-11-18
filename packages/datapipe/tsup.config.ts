import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

export default defineConfig({
  ...baseConfig,
  entry: {
    'index': 'src/index.ts',
    'datapipe-pipeline-worker': 'src/datapipe-pipeline-worker.ts',
  },
  external: ['@h-ai/core', 'zod'],
})
