import { saveTauriFeedbackFile } from './feedback-client-tauri.js'
import { feedback as clientFeedback } from './index.js'

export type * from './index.js'

/**
 * Tauri 保存适配器；原生依赖仅由此子路径加载。
 * @example
 * ```ts
 * import { feedback } from '@h-ai/feedback/tauri'
 *
 * // 在原生保存对话框中保存文本；取消通过 status 返回。
 * const result = await feedback.saveTauriFile(new TextEncoder().encode('diagnostics'), 'diagnostics.txt', 'text/plain')
 * void result.status
 * ```
 */
export const feedback = { ...clientFeedback, saveTauriFile: saveTauriFeedbackFile }
