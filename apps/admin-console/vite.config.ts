/**
 * =============================================================================
 * hai Admin Console - Vite 配置
 * =============================================================================
 */

import process from 'node:process'
import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  // 加载环境变量到 process.env
  const env = loadEnv(mode, process.cwd(), '')
  Object.assign(process.env, env)

  return {
    plugins: [
      sveltekit(),
      tailwindcss(),
    ],
    server: {
      port: 5173,
    },
  }
})
