/**
 * @h-ai/ui — 错误页场景组件 (Error Scenes)
 *
 * 通用错误页展示，内置常见 HTTP 错误预设。
 * @module index
 */

import { resolveErrorPreset } from './error-presets.js'

export { ERROR_PRESETS } from './error-presets.js'
export type { ErrorPreset, ErrorPresetInfo } from './error-presets.js'
export { default as ErrorPage } from './ErrorPage.svelte'

/**
 * 此组件子路径提供的运行工具。
 * @example
 * ```ts
 * import { ui } from '@h-ai/ui/components/scenes/error/index'
 *
 * // 选择 404 对应的错误页预设。
 * const preset = ui.resolveErrorPreset(404)
 * void preset
 * ```
 */
export const ui = { resolveErrorPreset }
