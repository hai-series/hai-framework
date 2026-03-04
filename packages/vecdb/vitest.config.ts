import { mergeConfig } from 'vitest/config'
import { baseTestConfig } from '../vitest.base'

export default mergeConfig(baseTestConfig, {
  test: {
    // 容器化测试（pgvector / qdrant）资源密集，禁止文件间并行以避免同时启动多个容器
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@h-ai/core': '../core/src/index.ts',
    },
  },
})
