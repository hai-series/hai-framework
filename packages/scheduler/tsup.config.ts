import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

export default defineConfig({
  ...baseConfig,
  entry: { 'index': 'src/index.ts', 'scheduler-js-worker': 'src/scheduler-js-worker.js' },
  external: ['@h-ai/core', '@h-ai/reldb', 'croner', 'zod'],
})
