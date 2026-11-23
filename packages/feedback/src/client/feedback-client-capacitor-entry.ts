import { saveCapacitorFeedbackFile } from './feedback-client-capacitor.js'
import { feedback as clientFeedback } from './index.js'

export type * from './index.js'

/**
 * Capacitor 保存适配器；原生依赖仅由此子路径加载。
 * @example
 * ```ts
 * import { feedback } from '@h-ai/feedback/capacitor'
 *
 * // 分享临时诊断文本；完成后由适配器清理缓存文件。
 * const result = await feedback.saveCapacitorFile(new TextEncoder().encode('diagnostics'), 'diagnostics.txt', 'text/plain')
 * void result.status
 * ```
 */
export const feedback = { ...clientFeedback, saveCapacitorFile: saveCapacitorFeedbackFile }
