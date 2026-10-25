/** Web 下载、Tauri 保存对话框、Capacitor 原生分享的统一入口。原生插件按平台懒加载。 */
import type { FeedbackAttachmentData } from '@h-ai/api-contract/feedback'
import type { HaiResult } from '@h-ai/core'
import { core, err, ok } from '@h-ai/core'
import { feedbackM } from '../feedback-i18n.js'
import { HaiFeedbackError } from '../feedback-types.js'

/**
 * 保存取消是正常用户操作，不应提示成功或失败。
 * @example
 * ```ts
 * import type { FeedbackSaveResult } from '@h-ai/feedback/client'
 * const cancelled: FeedbackSaveResult = { status: 'cancelled' }
 * ```
 */
export interface FeedbackSaveResult { status: 'saved' | 'shared' | 'cancelled' }

/**
 * 由平台入口提供的保存器；Web 不导入原生插件。
 * @example
 * ```ts
 * import type { FeedbackFileSaver } from '@h-ai/feedback/client'
 * const save: FeedbackFileSaver = async () => ({ status: 'cancelled' })
 * ```
 */
export type FeedbackFileSaver = (bytes: Uint8Array, filename: string, contentType: string, signal?: AbortSignal) => Promise<FeedbackSaveResult>

let nativeSaver: FeedbackFileSaver | undefined

/**
 * 原生入口一次性配置；生成工程自动调用。传 undefined 可解除自定义平台适配。
 * @example
 * ```ts
 * import { configureFeedbackSaving } from '@h-ai/feedback/client'
 * configureFeedbackSaving(undefined)
 * ```
 */
export function configureFeedbackSaving(saver: FeedbackFileSaver | undefined): void {
  nativeSaver = saver
}

/**
 * 解码受权附件或导出结果，网络与权限仍由 typed API 负责。
 * @example
 * ```ts
 * import { feedbackDataBytes } from '@h-ai/feedback/client'
 * const bytes = feedbackDataBytes({ name: 'data.txt', contentType: 'text/plain', dataBase64: 'YQ==' })
 * ```
 */
export function feedbackDataBytes(data: FeedbackAttachmentData): Uint8Array {
  return Uint8Array.from(atob(data.dataBase64), value => value.charCodeAt(0))
}

/**
 * 保存反馈文件。Tauri 只写用户选择的路径；Capacitor 只写临时缓存，分享结束后删除。
 * @example
 * ```ts
 * import { saveFeedbackFile } from '@h-ai/feedback/client'
 * const result = await saveFeedbackFile(new Uint8Array([1]), 'feedback.zip')
 * ```
 */
export async function saveFeedbackFile(bytes: Uint8Array, filename: string, contentType = 'application/zip', signal?: AbortSignal): Promise<HaiResult<FeedbackSaveResult>> {
  const name = [...filename].map(character => character.charCodeAt(0) < 32 || /[\\/:*?"<>|]/.test(character) ? '_' : character).join('').slice(0, 200) || 'feedback.zip'
  try {
    if (signal?.aborted)
      return ok({ status: 'cancelled' })
    if (typeof window === 'undefined')
      throw new Error('Browser required')
    const capacitor: unknown = Reflect.get(window, 'Capacitor')
    const isNative = Reflect.get(window, '__TAURI_INTERNALS__') || (capacitor && typeof capacitor === 'object' && 'isNativePlatform' in capacitor && typeof capacitor.isNativePlatform === 'function' && capacitor.isNativePlatform())
    if (isNative) {
      if (!nativeSaver)
        throw new Error('Feedback platform saving adapter is not configured')
      return ok(await nativeSaver(bytes, name, contentType, signal))
    }
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer], { type: contentType }))
    const link = document.createElement('a')
    try {
      link.href = url
      link.download = name
      document.body.append(link)
      link.click()
    }
    finally {
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    }
    return ok({ status: 'saved' })
  }
  catch (cause) {
    const error = core.error.toPublic({ ...HaiFeedbackError.OPERATION_FAILED, message: feedbackM('feedback_operationFailed') })
    core.logger.error('Feedback file save failed', { traceId: error.traceId, error: cause })
    return err(error)
  }
}
