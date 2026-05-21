/**
 * Vitest 配置（jsdom 环境，无 SvelteKit 依赖）。
 */
import process from 'node:process'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [svelte({ hot: !process.env.VITEST })],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.{test,spec}.ts'],
  },
})
