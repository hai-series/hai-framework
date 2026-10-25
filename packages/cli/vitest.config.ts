import { fileURLToPath } from 'node:url'
import { mergeConfig } from 'vitest/config'
import { baseTestConfig } from '../vitest.base.ts'

export default mergeConfig(baseTestConfig, {
  test: {
    globalSetup: [fileURLToPath(new URL('../../scripts/test-image-cleanup-setup.mjs', import.meta.url))],
  },
  resolve: {
    alias: { '@h-ai/feedback/bundle': fileURLToPath(new URL('../feedback/src/bundle/index.ts', import.meta.url)) },
  },
})
