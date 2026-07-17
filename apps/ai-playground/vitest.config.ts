import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      $lib: fileURLToPath(new URL('./src/lib', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    // 单元测试统一放在独立的 tests/ 目录，排除 Playwright 的 e2e 用例
    include: ['tests/**/*.test.ts'],
    exclude: ['e2e/**'],
  },
})
