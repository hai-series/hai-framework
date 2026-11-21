import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { mergeConfig } from 'vitest/config'
import { baseTestConfig } from '../vitest.base.ts'

export default mergeConfig(baseTestConfig, {
  test: {
    // Windows 的工程生成用例包含大量文件复制，串行文件 worker 避免争抢磁盘。
    maxWorkers: process.platform === 'win32'
      ? 1
      : 2,
    globalSetup: [
      fileURLToPath(new URL('../../scripts/test-image-cleanup-setup.mjs', import.meta.url)),
    ],
  },
  resolve: {
    alias: {
      '@h-ai/feedback/bundle': fileURLToPath(new URL('../feedback/src/bundle/index.ts', import.meta.url)),
    },
  },
})
