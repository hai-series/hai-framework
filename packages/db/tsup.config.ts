import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

export default defineConfig({
  ...baseConfig,
  entry: ['src/index.ts'],
  external: ['@hai/core', 'better-sqlite3', 'pg', 'mysql2'],
  // 排除 JSON 内容被内联到 d.ts
  esbuildOptions(options) {
    options.loader = { ...options.loader, '.json': 'copy' }
  },
})
