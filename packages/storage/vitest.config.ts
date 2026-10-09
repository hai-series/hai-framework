import { mergeConfig } from 'vitest/config'
import { baseTestConfig } from '../vitest.base'

export default mergeConfig(baseTestConfig, {
  test: {
    // S3 集成测试会启动 MinIO / RustFS；测试文件串行执行，控制 CI runner 的容器资源占用。
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@h-ai/core': '../core/src/index.ts',
    },
  },
})
