import { mergeConfig } from 'vitest/config'
import { baseTestConfig } from '../vitest.base'

export default mergeConfig(baseTestConfig, {
  test: {
    // PostgreSQL、Redis、LDAP 集成测试按文件串行，控制容器压力；分布式用例仍启动六个并发进程。
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@h-ai/cache': '../cache/src/index.ts',
      '@h-ai/core': '../core/src/index.ts',
      '@h-ai/crypto': '../crypto/src/index.ts',
      '@h-ai/reldb': '../reldb/src/index.ts',
    },
  },
})
