/** Tauri 独立入口，只有原生宿主导入插件。 */
import type { FeedbackFileSaver } from './feedback-client-files.js'
import { save } from '@tauri-apps/plugin-dialog'
import { writeFile } from '@tauri-apps/plugin-fs'

/**
 * Tauri 保存对话框与受权路径写入；取消和退出会话均不继续写入。
 * @example
 * ```ts
 * import { configureFeedbackSaving } from '@h-ai/feedback/client'
 * import { saveTauriFeedbackFile } from '@h-ai/feedback/tauri'
 * configureFeedbackSaving(saveTauriFeedbackFile)
 * ```
 */
export const saveTauriFeedbackFile: FeedbackFileSaver = async (bytes, filename, _contentType, signal) => {
  const path = await save({ defaultPath: filename })
  if (!path || signal?.aborted)
    return { status: 'cancelled' }
  await writeFile(path, bytes)
  return { status: 'saved' }
}
