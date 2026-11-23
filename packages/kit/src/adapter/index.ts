/**
 * @h-ai/kit/adapter — 双构建适配器入口
 *
 * @module adapter
 */

import { createAdapter } from '../kit-adapter.js'

export type { AdapterOptions } from '../kit-adapter.js'

/**
 * Kit adapter 子路径的统一入口。
 * @example
 * ```ts
 * import { kit } from '@h-ai/kit/adapter'
 *
 * // 创建适配器，实际构建由 SvelteKit 调用。
 * const adapter = kit.adapter.create()
 * void adapter
 * ```
 */
export const kit = {
  adapter: {
    create: createAdapter,
  },
}
