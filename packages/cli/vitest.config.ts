import { fileURLToPath } from 'node:url'
import { mergeConfig } from 'vitest/config'
import { baseTestConfig } from '../vitest.base.ts'

export default mergeConfig(baseTestConfig, {
  resolve: {
    alias: { '@h-ai/feedback/bundle': fileURLToPath(new URL('../feedback/src/bundle/index.ts', import.meta.url)) },
  },
})
