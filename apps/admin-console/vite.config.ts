/**
 * =============================================================================
 * hai Admin Console - Vite 配置
 * =============================================================================
 */

import path from 'node:path'
import process from 'node:process'
import { paraglideVitePlugin } from '@inlang/paraglide-js'
import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'
import { haiResolvePlugin } from '../../packages/kit/src/vite/kit-vite-resolve.js'

export default defineConfig(({ mode }) => {
  // 加载环境变量到 process.env
  const env = loadEnv(mode, process.cwd(), '')
  Object.assign(process.env, env)

  return {
    plugins: [
      haiResolvePlugin(),
      sveltekit(),
      tailwindcss(),
      paraglideVitePlugin({
        project: './project.inlang',
        outdir: './src/lib/paraglide',
        // 只使用 cookie 策略，不用 URL 前缀
        strategy: ['cookie', 'baseLocale'],
      }),
    ],
    optimizeDeps: {
      exclude: ['bits-ui'],
    },
    server: {
      port: 5173,
      fs: {
        allow: [
          path.resolve(process.cwd(), '..', '..'),
        ],
      },
    },
  }
})
