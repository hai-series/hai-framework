/**
 * =============================================================================
 * hai Corporate Website - Vite 配置
 * =============================================================================
 */

import path from 'node:path'
import process from 'node:process'
import { core } from '@h-ai/core'
import { haiOptimizeExclude, haiPrebundledDeps } from '@h-ai/ui/vite'
import { paraglideVitePlugin } from '@inlang/paraglide-js'
import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import appPackage from './package.json' with { type: 'json' }

export default defineConfig(({ mode, command }) => {
  const envResult = command === 'build' ? { success: true as const, data: {} as Record<string, string> } : core.config.loadEnvFiles({ mode, envDir: process.cwd() })
  if (!envResult.success)
    throw new Error(envResult.error.message)
  const env = envResult.data
  Object.assign(process.env, env)

  return {
    envDir: false,
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
      // bits-ui 含 .svelte 源码须 exclude；@internationalized/date 须与 bits-ui 同为原始副本，
      // 避免日期类型 instanceof 失败（"Unknown date type"）。
      exclude: [...haiOptimizeExclude],
      // 提前预打包 @h-ai/* 框架的重型纯 JS 依赖，避免首次进入业务路由时
      // 触发 Vite 依赖再优化与整页刷新（参见 @h-ai/ui/vite）。
      include: [...haiPrebundledDeps],
    },
    ssr: {
      // UI 组件及 Kit 的 $app 路由别名需要 Vite 编译。
      noExternal: ['@h-ai/ui', '@h-ai/kit'],
      // 工作区链接的纯服务端包保留原生加载，避免日志、数据库等依赖被再次打包。
      external: ['sm-crypto', ...Object.keys(appPackage.dependencies).filter(name => name.startsWith('@h-ai/') && name !== '@h-ai/ui' && name !== '@h-ai/kit')],
    },
    build: {
      rollupOptions: {
        external: ['pdfjs-dist/legacy/build/pdf.mjs', 'mammoth'],
      },
    },
    server: {
      fs: {
        allow: [
          path.resolve(process.cwd(), '..', '..'),
        ],
      },
    },
  }
})
