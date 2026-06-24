/**
 * =============================================================================
 * @h-ai/ui - Vite 开发优化辅助
 * =============================================================================
 * 说明：
 *   @h-ai/ui 的 barrel 入口会静态引入语法高亮（shiki + 27 种语言定义）、
 *   Mermaid、Markdown、PDF 等较重的运行时依赖。这些依赖以纯 JS 形态存在，
 *   若在首次进入相关路由时才被 Vite 依赖优化器发现，会触发一次
 *   "new dependencies optimized -> reloading" 的整页刷新（并伴随 daisyUI
 *   CSS 重新编译），表现为"点击后要等一会才刷新可用"。
 *
 *   将这些依赖加入各应用 `optimizeDeps.include`，让 Vite 在开发服务器启动时
 *   一次性预打包，即可消除运行中途的再优化与整页刷新。
 *
 * 用法（应用 vite.config.ts）：
 *   import { haiPrebundledDeps } from '@h-ai/ui/vite'
 *   optimizeDeps: {
 *     exclude: ['bits-ui'],
 *     include: [...haiPrebundledDeps],
 *   }
 * =============================================================================
 */

/**
 * hai 框架在开发态需要提前预打包的纯 JS 依赖清单。
 *
 * 这些依赖经由 @h-ai/ui 等框架包间接引入（如语法高亮、Mermaid、PDF、加密传输等），
 * 若延迟到首次进入业务路由时才被 Vite 依赖优化器发现，会触发整页刷新。
 * shiki 语言列表需与 `src/lib/components/scenes/ai/highlight.ts` 保持一致。
 *
 * @type {readonly string[]}
 */
export const haiPrebundledDeps = Object.freeze([
  // ─── 语法高亮（shiki 核心 + 引擎 + 语言定义） ───
  'shiki/core',
  'shiki/engine/javascript',
  '@shikijs/langs/bash',
  '@shikijs/langs/c',
  '@shikijs/langs/cpp',
  '@shikijs/langs/csharp',
  '@shikijs/langs/css',
  '@shikijs/langs/diff',
  '@shikijs/langs/go',
  '@shikijs/langs/graphql',
  '@shikijs/langs/html',
  '@shikijs/langs/java',
  '@shikijs/langs/javascript',
  '@shikijs/langs/json',
  '@shikijs/langs/kotlin',
  '@shikijs/langs/lua',
  '@shikijs/langs/markdown',
  '@shikijs/langs/php',
  '@shikijs/langs/python',
  '@shikijs/langs/ruby',
  '@shikijs/langs/rust',
  '@shikijs/langs/scss',
  '@shikijs/langs/shellscript',
  '@shikijs/langs/sql',
  '@shikijs/langs/swift',
  '@shikijs/langs/toml',
  '@shikijs/langs/typescript',
  '@shikijs/langs/xml',
  '@shikijs/langs/yaml',
  // ─── 文档 / 图表 / 导出 ───
  'marked',
  'mermaid',
  'jspdf',
  'html2canvas',
  // ─── 工具 ───
  'tailwind-merge',
  // ─── 框架运行时（@h-ai/core / @h-ai/crypto / @h-ai/kit 在登录等路径引入） ───
  'nanoid',
  'process',
  'sm-crypto',
  // ─── bits-ui 的纯 JS 传递依赖（bits-ui 自身因含 .svelte 仍需 exclude） ───
  'bits-ui > @floating-ui/dom',
  'bits-ui > @floating-ui/core',
  'bits-ui > tabbable',
  'bits-ui > esm-env',
])

/**
 * 需要从 Vite 依赖预打包中排除的依赖清单。
 *
 * - bits-ui：自带 .svelte 源码，无法被 esbuild 预打包，须交给 vite-plugin-svelte。
 * - @internationalized/date：bits-ui（被 exclude，按源码加载）内部用 `instanceof CalendarDate`
 *   判别日期类型。若应用侧用「已优化」副本、bits-ui 用「原始」副本，会产生两个模块实例导致
 *   instanceof 失败并抛 "Unknown date type"。统一排除，使两侧都加载同一份原始 ESM，单实例。
 *
 * @type {readonly string[]}
 */
export const haiOptimizeExclude = Object.freeze([
  'bits-ui',
  '@internationalized/date',
])
