/**
 * @h-ai/kit — Vite 条件解析插件
 *
 * 为有 browser/node 双入口的 @h-ai 包提供环境感知的模块解析：
 * - SSR（Node.js）  → index.ts（完整功能，含 node:fs、pino 等）
 * - Client（浏览器）→ *-index.browser.ts（轻量入口，无 Node.js API）
 *
 * 工作模式：
 * - **Monorepo dev**：检测到 packages 源码目录 → 解析到源码 .ts 文件（支持 HMR）
 * - **npm 生产**：源码目录不存在 → 返回 null，由 Vite 通过 package.json exports.browser 条件自动解析
 *
 * @module kit-vite-resolve
 */

import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 双入口包配置。
 *
 * key: 包名（如 '@h-ai/core'）
 * value: 包目录名 + 浏览器入口文件名
 */
interface DualEntryDef {
  /** packages 下的目录名 */
  dir: string
  /** 浏览器入口文件（相对于 src/） */
  browserEntry: string
}

/** 当前已注册的双入口包（随模块增加可在此扩展） */
const DUAL_ENTRY_PACKAGES: Record<string, DualEntryDef> = {
  '@h-ai/core': { dir: 'core', browserEntry: 'core-index.browser.ts' },
  '@h-ai/ai': { dir: 'ai', browserEntry: 'ai-index.browser.ts' },
  '@h-ai/iam': { dir: 'iam', browserEntry: 'iam-index.browser.ts' },
  '@h-ai/storage': { dir: 'storage', browserEntry: 'storage-index.browser.ts' },
}

/**
 * 推断 monorepo packages 根目录。
 *
 * 从本文件位置向上查找：
 * - 开发模式：kit/src/vite/kit-vite-resolve.ts → ../../.. → packages/
 * - 构建后：kit/dist/vite/kit-vite-resolve.js → ../../.. → packages/
 *
 * @returns packages 目录绝对路径；若不存在返回 null
 */
function detectPackagesRoot(): string | null {
  const thisDir = dirname(fileURLToPath(import.meta.url))
  // 从 kit 包根目录（thisDir/../../..）到 packages/
  const kitRoot = resolve(thisDir, '..', '..')
  const packagesRoot = resolve(kitRoot, '..')

  // 用 core 包是否存在来判断是否处于 monorepo
  const coreSrc = join(packagesRoot, 'core', 'src', 'index.ts')
  return existsSync(coreSrc) ? packagesRoot : null
}

/**
 * 创建 @h-ai 双入口包的 Vite 条件解析插件。
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { haiResolvePlugin } from '@h-ai/kit/vite'
 *
 * export default defineConfig({
 *   plugins: [haiResolvePlugin(), sveltekit()],
 * })
 * ```
 */
export function haiResolvePlugin() {
  const packagesRoot = detectPackagesRoot()

  return {
    name: 'hai-resolve',
    enforce: 'pre' as const,

    resolveId(source: string, _importer: string | undefined, options: { ssr?: boolean }) {
      const entry = DUAL_ENTRY_PACKAGES[source]
      if (!entry)
        return null

      // npm 模式：源码不存在，交给 Vite 默认解析（走 package.json exports.browser）
      if (!packagesRoot)
        return null

      const file = options.ssr ? 'index.ts' : entry.browserEntry
      return join(packagesRoot, entry.dir, 'src', file)
    },
  }
}
