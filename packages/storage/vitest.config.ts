import { mergeConfig } from 'vitest/config'
import { baseTestConfig } from '../vitest.base'

export default mergeConfig(baseTestConfig, {
  test: {
    // S3 集成测试会启动 MinIO；禁止测试文件并行，避免 CI runner 同时启动多个容器导致就绪探测失败。
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@h-ai/core': '../core/src/index.ts',
    },
  },
})
