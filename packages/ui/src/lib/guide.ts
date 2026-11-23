import { createGuide, resolveGuideText } from './guide.svelte.js'

export * from './components/scenes/guide/index.js'
export * from './guide-types.js'

/**
 * 此组件子路径提供的运行工具。
 * @example
 * ```ts
 * import { ui } from '@h-ai/ui/guide'
 *
 * // 字符串形式的引导文案保持其内容。
 * const label = ui.resolveGuideText('下一步')
 * void label
 * ```
 */
export const ui = { resolveGuideText, createGuide }
