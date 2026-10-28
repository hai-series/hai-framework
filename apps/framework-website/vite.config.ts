/**
 * framework-website - Vite 配置
 */
import type { Plugin } from 'vite'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { core } from '@h-ai/core'
import { haiOptimizeExclude, haiPrebundledDeps } from '@h-ai/ui/vite'
import { paraglideVitePlugin } from '@inlang/paraglide-js'
import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { resolveBuildMetadata } from './scripts/build-metadata.js'

export default defineConfig(({ mode, command }) => {
  const envResult = command === 'build' || process.env.HAI_E2E === '1' ? { success: true as const, data: {} as Record<string, string> } : core.config.loadEnvFiles({ mode, envDir: process.cwd() })
  if (!envResult.success)
    throw new Error(envResult.error.message)
  const env = envResult.data
  Object.assign(process.env, env)
  const buildMetadata = resolveBuildMetadata(fileURLToPath(new URL('.', import.meta.url)))
  const metadataAsset: Plugin = {
    name: 'hai-build-metadata',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'build-metadata.json', source: JSON.stringify(buildMetadata) })
    },
  }
  const screenshotAssets: Plugin = {
    name: 'hai-public-documentation-assets',
    async generateBundle() {
      // 从当前公开原图发射，Vite清理旧产物；不累积已从手册删除的图片。
      const directory = path.resolve('../../docs/usage/images')
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (entry.isFile())
          this.emitFile({ type: 'asset', fileName: `guide-images/${entry.name}`, source: await readFile(path.join(directory, entry.name)) })
      }
      this.emitFile({ type: 'asset', fileName: '.nojekyll', source: '' })
    },
  }

  return {
    envDir: false,
    envPrefix: ['VITE_', 'PUBLIC_'],
    define: {
      __HAI_BUILD_METADATA__: JSON.stringify(buildMetadata),
    },
    plugins: [
      metadataAsset,
      screenshotAssets,
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
      // 预打包 @h-ai/ui 的重型纯 JS 依赖，避免首次进入业务路由触发依赖再优化与整页刷新
      include: [...haiPrebundledDeps],
    },
    ssr: {
      noExternal: ['@h-ai/ui', '@h-ai/kit'],
      // sm-crypto 同时列入生产依赖，避免 adapter-node 再次打包其动态 require。
      external: ['@h-ai/core', 'sm-crypto'],
    },
    server: {
      fs: {
        allow: [path.resolve(process.cwd())],
      },
    },
  }
})
