import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

export default defineConfig({
  ...baseConfig,
  // db 仅提供 Node 侧运行时入口
  entry: { index: 'src/index.ts' },
  // 由使用方提供 runtime 依赖，避免重复打包
  external: ['@h-ai/core', 'better-sqlite3', 'pg', 'mysql2', 'zod'],
})
