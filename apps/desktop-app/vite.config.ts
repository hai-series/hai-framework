/**
 * =============================================================================
 * hai Desktop App - Vite 配置
 * =============================================================================
 */

import process from 'node:process'
import { paraglideVitePlugin } from '@inlang/paraglide-js'
import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

// Tauri 在生产环境期望使用固定端口，dev 使用 5176 避免与其它应用冲突
const host = process.env.TAURI_DEV_HOST

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  Object.assign(process.env, env)

  return {
    plugins: [
      sveltekit(),
      tailwindcss(),
      paraglideVitePlugin({
        project: './project.inlang',
        outdir: './src/lib/paraglide',
        strategy: ['cookie', 'baseLocale'],
      }),
    ],
    optimizeDeps: {
      exclude: ['@h-ai/ui'],
    },
    // Vite 相关配置 — 参考 Tauri v2 官方文档
    clearScreen: false,
    server: {
      port: 5176,
      strictPort: true,
      host: host || false,
      hmr: host
        ? { protocol: 'ws', host, port: 5177 }
        : undefined,
      watch: {
        ignored: ['**/src-tauri/**'],
      },
    },
  }
})
