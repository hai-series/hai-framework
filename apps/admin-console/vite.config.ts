/**
 * =============================================================================
 * hai Admin Console - Vite 配置
 * =============================================================================
 */

import path from 'node:path'
import process from 'node:process'
import { haiOptimizeExclude, haiPrebundledDeps } from '@h-ai/ui/vite'
import { paraglideVitePlugin } from '@inlang/paraglide-js'
import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

const HAI_PACKAGE_REGEX = /@h-ai\//

export default defineConfig(({ mode }) => {
  // 加载环境变量到 process.env
  const env = loadEnv(mode, process.cwd(), '')
  Object.assign(process.env, env)

  return {
    plugins: [
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
      // bits-ui 含 .svelte 源码须 exclude；@internationalized/date 须与 bits-ui 同为原始副本，
      // 避免日期类型 instanceof 失败（"Unknown date type"）。
      exclude: [...haiOptimizeExclude],
      // 提前预打包 @h-ai/ui 的重型纯 JS 依赖与本应用的纯 JS 依赖，
      // 避免首次进入业务路由时触发 Vite 依赖再优化与整页刷新（参见 @h-ai/ui/vite）。
      include: [
        ...haiPrebundledDeps,
        'yaml',
        'zod',
      ],
    },
    ssr: {
      noExternal: [HAI_PACKAGE_REGEX],
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
