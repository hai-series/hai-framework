/**
 * =============================================================================
 * 共享 vitest 配置
 * =============================================================================
 */

import { defineConfig } from 'vitest/config'

export const baseTestConfig = defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // 根任务按包并行；每包限制两个隔离 worker，避免嵌套并行耗尽内存和容器资源。
    maxWorkers: 2,
    include: ['tests/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/index.ts'],
    },
  },
})
