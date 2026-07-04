import { mergeConfig } from 'vitest/config'
import { baseTestConfig } from '../vitest.base'

export default mergeConfig(baseTestConfig, {
  test: {
    // reldb 测试跨文件共享同一个模块单例（连接池 / 当前 provider / testcontainer 租约）。
    // 文件级并发会让 beforeEach/afterEach 的 init/close 交叉执行，导致 MySQL / PostgreSQL
    // 套件互相踩状态，表现为随机的 42P01 / 23502 / 容器就绪超时。固定关闭文件并发，
    // 让每个测试文件顺序独立完成，单包实测 554/554 全通过。
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@h-ai/core': '../core/src/index.ts',
    },
  },
})
