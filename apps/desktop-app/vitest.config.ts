/**
 * Vitest 配置（jsdom 环境，无 SvelteKit 依赖）。
 */
import process from 'node:process'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vitest/config'
import { desktopBuildConfig } from './config-env.js'

export default defineConfig({
  define: { __DESKTOP_CRYPTO_CONFIG__: desktopBuildConfig('test') },
  plugins: [svelte({ hot: !process.env.VITEST })],
  test: {
    maxWorkers: 2,
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.{test,spec}.ts'],
  },
})
