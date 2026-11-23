import { errorMessage, notifyError, notifyInfo, notifySuccess, notifyWarning, toast, useToastFeedback } from './toast.svelte.js'

export type { ToastItem } from './toast.svelte.js'

const helpers = {
  useToastFeedback,
  notifySuccess,
  notifyError,
  errorMessage,
  notifyInfo,
  notifyWarning,
}

/**
 * UI toast 子路径的运行入口。
 * @example
 * ```ts
 * import { ui } from '@h-ai/ui/toast'
 *
 * // 发送提示并通过同一状态对象移除它。
 * const id = ui.notifySuccess('已保存', 0)
 * ui.toast.remove(id)
 * ```
 */
export const ui: typeof helpers & { toast: typeof toast } = {
  ...helpers,
  toast,
}
