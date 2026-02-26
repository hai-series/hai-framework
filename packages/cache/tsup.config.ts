import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

export default defineConfig({
  ...baseConfig,
  // cache 当前仅提供 Node 侧运行时入口
  entry: { index: 'src/index.ts' },
  // 由使用方提供 runtime 依赖，避免重复打包
  external: ['@h-ai/core', 'ioredis', 'zod'],
})
