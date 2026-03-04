/**
 * SvelteKit 双构建模式 — 适配器工厂
 *
 * 根据 `VITE_ADAPTER` 环境变量自动选择 adapter-node 或 adapter-static，
 * 使同一个 SvelteKit 应用能同时产出 SSR（Web + API）和 SPA（H5/App）两种构建产物。
 *
 * @example
 * ```js
 * // svelte.config.js
 * import { createAdapter } from '@h-ai/kit/adapter'
 *
 * export default {
 *   kit: {
 *     adapter: createAdapter(),
 *   },
 * }
 * ```
 *
 * @module kit-adapter
 */

import process from 'node:process'

/** 双构建适配器配置 */
export interface AdapterOptions {
  /** adapter-node 输出目录，默认 `'build'` */
  nodeBuildDir?: string
  /** adapter-static 输出目录，默认 `'build-static'` */
  staticBuildDir?: string
  /** adapter-static 的 SPA fallback 页面，默认 `'index.html'` */
  staticFallback?: string
}

/**
 * 根据环境变量 `VITE_ADAPTER` 选择 SvelteKit adapter
 *
 * - `VITE_ADAPTER=node`   → `@sveltejs/adapter-node`（SSR + API）
 * - `VITE_ADAPTER=static` → `@sveltejs/adapter-static`（SPA，可被 Capacitor 包装）
 * - 未设置时默认使用 `node`
 *
 * **注意**：adapter-node / adapter-static 仍然需要在应用的 devDependencies 中声明。
 * 本函数只做动态 import + 统一配置。
 */
export async function createAdapter(options?: AdapterOptions) {
  const {
    nodeBuildDir = 'build',
    staticBuildDir = 'build-static',
    staticFallback = 'index.html',
  } = options ?? {}

  const mode = process.env.VITE_ADAPTER ?? 'node'

  if (mode === 'static') {
    const { default: adapterStatic } = await import('@sveltejs/adapter-static')
    return adapterStatic({
      pages: staticBuildDir,
      assets: staticBuildDir,
      fallback: staticFallback,
      precompress: false,
    })
  }

  // 默认 node
  const { default: adapterNode } = await import('@sveltejs/adapter-node')
  return adapterNode({
    out: nodeBuildDir,
  })
}
