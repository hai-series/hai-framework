/**
 * =============================================================================
 * hai Admin Console - Vite 配置
 * =============================================================================
 */

import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
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
  if (command !== 'build' && process.env.HAI_E2E !== '1') {
    const env = core.config.loadEnvFiles({ mode })
    if (!env.success)
      throw new Error(env.error.message)
    Object.assign(process.env, env.data)
  }

  let commit = process.env.HAI_BUILD_COMMIT ?? 'unknown'
  if (commit === 'unknown') {
    try {
      commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim()
    }
    catch { /* 源码归档构建可能没有 .git，明确保留 unknown。 */ }
  }
  const metadata = { appVersion: appPackage.version, buildId: process.env.HAI_BUILD_ID ?? randomUUID(), commit }

  return {
    define: { __HAI_BUILD_METADATA__: JSON.stringify(metadata) },
    envDir: false,
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
      // UI 组件及 Kit 的 $app 路由别名需要 Vite 编译。
      noExternal: ['@h-ai/ui', '@h-ai/kit'],
      // 工作区链接的纯服务端包保留原生加载，避免日志、数据库等依赖被再次打包。
      external: ['sm-crypto', ...Object.keys(appPackage.dependencies).filter(name => name.startsWith('@h-ai/') && name !== '@h-ai/ui' && name !== '@h-ai/kit')],
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
