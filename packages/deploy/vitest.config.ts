import process from 'node:process'
import { mergeConfig } from 'vitest/config'
import { baseTestConfig } from '../vitest.base.ts'

export default mergeConfig(baseTestConfig, {
  test: {
    // Windows 原生密码 helper 编译与打包命令都启动系统子进程，串行文件避免同包争用。
    maxWorkers: process.platform === 'win32' ? 1 : 2,
  },
  resolve: {
    alias: {
      '@h-ai/core': '../core/src/index.ts',
    },
  },
})
