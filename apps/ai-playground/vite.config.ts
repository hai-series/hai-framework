import path from 'node:path'
import process from 'node:process'
import { core } from '@h-ai/core'
import { autoImportHaiUi } from '@h-ai/ui/auto-import'
import { haiOptimizeExclude, haiPrebundledDeps } from '@h-ai/ui/vite'
import { paraglideVitePlugin } from '@inlang/paraglide-js'
import adapter from '@sveltejs/adapter-node'
import { sveltekit } from '@sveltejs/kit/vite'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { browserStartupAssets } from '../../scripts/vite-browser-startup.js'
import appPackage from './package.json' with { type: 'json' }

export default defineConfig(({ mode, command }) => {
  const envResult = command === 'build' || process.env.HAI_E2E === '1'
    ? { success: true as const, data: {} as Record<string, string> }
    : core.config.loadEnvFiles({
        mode,
        envDir: process.cwd(),
      })
  if (!envResult.success)
    throw new Error(envResult.error.message)
  const env = envResult.data
  Object.assign(process.env, env)

  return {
    envDir: false,
    plugins: [
      browserStartupAssets(),
      sveltekit({
        preprocess: [
          vitePreprocess(),
          autoImportHaiUi(),
        ],
        compilerOptions: {
          runes: true,
        },
        env: { dir: './.svelte-kit' },
        adapter: adapter(),
        csrf: {
          trustedOrigins: process.env.HAI_E2E === '1'
            ? ['http://localhost:4180', 'http://127.0.0.1:4180']
            : [],
        },
        paths: { relative: false },
      }),
      tailwindcss(),
      paraglideVitePlugin({
        // 共享物理消息产物供独立 Vitest/Node 工具读取。
        outputStructure: 'message-modules',
        project: './project.inlang',
        outdir: './src/lib/paraglide',
        strategy: ['cookie', 'baseLocale'],
      }),
    ],
    optimizeDeps: {
      exclude: [...haiOptimizeExclude],
      include: [...haiPrebundledDeps],
    },
    ssr: {
      // UI 组件及 Kit 的 $app 路由别名需要 Vite 编译。
      noExternal: ['@h-ai/ui', '@h-ai/kit'],
      // 工作区链接的纯服务端包保留原生加载，避免日志、数据库等依赖被再次打包。
      external: [
        'sm-crypto',
        ...Object.keys(appPackage.dependencies).filter(name => name.startsWith('@h-ai/') && name !== '@h-ai/ui' && name !== '@h-ai/kit'),
      ],
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
