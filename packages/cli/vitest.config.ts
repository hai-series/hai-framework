import { mergeConfig } from 'vitest/config'
import { baseTestConfig } from '../vitest.base'

export default mergeConfig(baseTestConfig, {
  test: {
    // 真实模板 lint 的首次插件加载与归档子进程、批量生成共享文件系统资源。
    // 并行文件在 Windows 全仓冷启动时使准备阶段超时；串行执行保留所有断言与超时限制。
    fileParallelism: false,
  },
})
