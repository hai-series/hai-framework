import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

export default defineConfig({
  ...baseConfig,
  // db 仅提供 Node 侧运行时入口
  entry: { index: 'src/index.ts' },
  // 由使用方提供 runtime 依赖，避免重复打包
  external: ['@h-ai/core', 'better-sqlite3', 'pg', 'mysql2', 'zod'],
  // SQLite worker 为纯 JS 运行时脚本（供 worker_threads 直接加载），构建后复制到 dist 对应路径。
  onSuccess: 'node scripts/copy-sqlite-worker.mjs',
})
