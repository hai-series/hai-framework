/**
 * =============================================================================
 * @h-ai/ui - vitest 配置
 * =============================================================================
 */

import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [svelte()],
  test: {
    globals: true,
    environment: 'node', // 纯逻辑测试用 node 环境
    include: ['tests/**/*.test.ts'],
  },
})
