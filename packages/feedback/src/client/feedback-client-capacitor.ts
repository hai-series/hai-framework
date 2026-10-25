/** Capacitor 独立入口，只在 App 中导入插件，缓存目录由本次调用负责清理。 */
import type { FeedbackFileSaver } from './feedback-client-files.js'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

/**
 * 以原生分享保存临时诊断包；分享结束、失败或退出会话均清理缓存。
 * @example
 * ```ts
 * import { configureFeedbackSaving } from '@h-ai/feedback/client'
 * import { saveCapacitorFeedbackFile } from '@h-ai/feedback/capacitor'
 * configureFeedbackSaving(saveCapacitorFeedbackFile)
 * ```
 */
export const saveCapacitorFeedbackFile: FeedbackFileSaver = async (bytes, filename, _contentType, signal) => {
  const path = `feedback/${globalThis.crypto.randomUUID()}/${filename}`
  const cleanup = () => Filesystem.rmdir({ path: path.slice(0, path.lastIndexOf('/')), directory: Directory.Cache, recursive: true }).catch(() => undefined)
  const abort = () => {
    void cleanup()
  }
  let raw = ''
  for (let offset = 0; offset < bytes.length; offset += 32768)
    raw += String.fromCharCode(...bytes.subarray(offset, offset + 32768))
  try {
    if (signal?.aborted)
      return { status: 'cancelled' }
    const file = await Filesystem.writeFile({ path, data: btoa(raw), directory: Directory.Cache, recursive: true })
    if (signal?.aborted)
      return { status: 'cancelled' }
    signal?.addEventListener('abort', abort, { once: true })
    await Share.share({ files: [file.uri], dialogTitle: filename })
    return { status: signal?.aborted ? 'cancelled' : 'shared' }
  }
  catch (cause) {
    // 原生插件以固定消息表示主动取消；其余异常交给统一保存边界记录并返回失败。
    if (cause instanceof Error && cause.message === 'Share canceled')
      return { status: 'cancelled' }
    throw cause
  }
  finally {
    signal?.removeEventListener('abort', abort)
    await cleanup()
  }
}
