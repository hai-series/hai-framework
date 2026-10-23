/**
 * =============================================================================
 * hai Mobile App - Vite 配置
 * =============================================================================
 */

import process from 'node:process'
import { core } from '@h-ai/core'
import { haiOptimizeExclude, haiPrebundledDeps } from '@h-ai/ui/vite'
import { paraglideVitePlugin } from '@inlang/paraglide-js'
import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { publicRuntimeConfig } from '../../scripts/vite-runtime-config.js'

export default defineConfig(({ mode, command }) => {
  const envResult = command === 'build' || process.env.HAI_E2E === '1' ? { success: true as const, data: {} as Record<string, string> } : core.config.loadEnvFiles({ mode, envDir: process.cwd() })
  if (!envResult.success)
    throw new Error(envResult.error.message)
  const env = envResult.data
  Object.assign(process.env, env)

  return {
    envDir: false,
    envPrefix: ['VITE_', 'PUBLIC_'],
    plugins: [
      publicRuntimeConfig({ apiBase: process.env.PUBLIC_API_BASE, apiTransport: process.env.PUBLIC_API_TRANSPORT, apiKeyExchangePath: process.env.PUBLIC_API_KEY_EXCHANGE_PATH }),
      sveltekit(),
      tailwindcss(),
      paraglideVitePlugin({
        project: './project.inlang',
        outdir: './src/lib/paraglide',
        strategy: ['cookie', 'baseLocale'],
      }),
    ],
    optimizeDeps: {
      // @h-ai/ui 与 bits-ui 含 .svelte 源码，交给 vite-plugin-svelte 处理；
      // @internationalized/date 须与 bits-ui 同为原始副本，避免 "Unknown date type"。
      exclude: ['@h-ai/ui', ...haiOptimizeExclude],
      // 提前预打包 @h-ai/* 框架的重型纯 JS 依赖，避免首次进入业务路由时
      // 触发 Vite 依赖再优化与整页刷新（参见 @h-ai/ui/vite）。
      include: [...haiPrebundledDeps],
    },
  }
})
