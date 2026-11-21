/**
 * @h-ai/storage — 前端存储客户端
 *
 * 提供前端通过签名 URL 直接上传下载文件的功能。
 * @module storage-client
 */

import type { ClientDownloadOptions, ClientOperations, ClientUploadOptions } from '../storage-types.js'
import { core } from '@h-ai/core'
import { storageM } from '../storage-i18n.js'

import { getMimeType } from '../storage-mime.js'

const logger = core.logger.child({ module: 'storage', scope: 'client' })

function transferFailure(operation: string, error: string, httpStatus?: number): { success: false, error: string } {
  logger.warn('Storage client operation failed', { operation, httpStatus })
  return { success: false, error }
}

// ─── 上传功能 ───

/**
 * 使用签名 URL 上传文件
 *
 * @param url - 已成功获取的 S3 HTTP(S) 上传签名 URL；本地存储须使用应用的鉴权文件接口。
 * @param data - 要上传的数据（File、Blob、ArrayBuffer 或字符串）
 * @param options - 上传选项
 * @returns 上传结果；预取消不发送，进行中取消/网络失败/初始化异常结算为失败，终态移除本次监听。
 * 取消不代表远端对象已回滚；上传完成后的撤销由应用另行授权删除。
 * @example
 * ```ts
 * import { storage } from '@h-ai/storage/client'
 *
 * // url 由应用鉴权接口返回，且 S3 签名包含相同 Content-Type。
 * async function upload(url: string, file: File) {
 *   const result = await storage.client.uploadWithPresignedUrl(url, file, { contentType: file.type })
 *   if (!result.success) throw new Error(result.error)
 * }
 * ```
 */
async function uploadWithPresignedUrl(
  url: string,
  data: File | Blob | ArrayBuffer | string,
  options: ClientUploadOptions = {},
): Promise<{ success: boolean, error?: string }> {
  const operation = 'uploadWithPresignedUrl'
  const signal = options.abortController?.signal
  logger.debug('Storage client operation started', { operation })
  try {
    if (signal?.aborted) {
      return transferFailure(operation, storageM('storage_uploadCanceled'))
    }

    // 准备请求体
    const body: BodyInit = data

    // 使用 XMLHttpRequest 以支持上传进度
    if (options.onProgress) {
      const xhr = new XMLHttpRequest()
      return new Promise((resolve) => {
        let settled = false

        /**
         * 所有终态共用一次结算，先移除XHR/上传/signal监听，迟到事件不能改变结果。
         * 后续调用跳过，完成后取消不会再触碰旧XHR。
         * @param result - 本次最终结果，不推断远端是否已写对象。
         * @param result.success - 是否已成功完成本地请求。
         * @param result.error - 可选失败说明。
         * @param httpStatus - HTTP 响应状态，适用于服务端拒绝上传。
         * @example 模块内部上下文
         * ```ts
         * finish({ success: false, error: storageM('storage_networkError') })
         * ```
         */
        function finish(result: { success: true } | { success: false, error: string }, httpStatus?: number): void {
          if (settled)
            return
          settled = true
          signal?.removeEventListener('abort', onCancel)
          xhr.upload.removeEventListener('progress', onProgress)
          xhr.removeEventListener('load', onLoad)
          xhr.removeEventListener('error', onError)
          xhr.removeEventListener('abort', onAbort)
          xhr.removeEventListener('timeout', onError)
          resolve(result.success
            ? result
            : transferFailure(operation, result.error, httpStatus))
        }

        function onAbort(): void {
          finish({
            success: false,
            error: storageM('storage_uploadCanceled'),
          })
        }

        /**
         * signal取消先主动结算再终止XHR，覆盖未send时abort不发事件的原生行为。
         * 调用方在准备流程中检查settled后停止发送。
         * @example 模块内部上下文
         * ```ts
         * onCancel()
         * // 后续准备阶段读取settled，不再执行xhr.send。
         * ```
         */
        function onCancel(): void {
          // 未 send 的 XHR.abort 不一定发 abort 事件，取消方必须主动结算。
          onAbort()
          xhr.abort()
        }

        function onError(): void {
          finish({
            success: false,
            error: storageM('storage_networkError'),
          })
        }

        function onLoad(): void {
          finish(xhr.status >= 200 && xhr.status < 300
            ? { success: true }
            : {
                success: false,
                error: storageM('storage_uploadFailedStatus', {
                  params: { status: xhr.status, statusText: xhr.statusText },
                }),
              }, xhr.status)
        }

        function onProgress(event: ProgressEvent): void {
          if (settled || !event.lengthComputable)
            return
          try {
            options.onProgress?.({
              loaded: event.loaded,
              total: event.total,
              percent: Math.round((event.loaded / event.total) * 100),
            })
          }
          catch (error) {
            finish({
              success: false,
              error: error instanceof Error
                ? error.message
                : storageM('storage_unknownError'),
            })
            xhr.abort()
          }
        }

        try {
          xhr.upload.addEventListener('progress', onProgress)
          xhr.addEventListener('load', onLoad)
          xhr.addEventListener('error', onError)
          xhr.addEventListener('abort', onAbort)
          xhr.addEventListener('timeout', onError)
          signal?.addEventListener('abort', onCancel, { once: true })
          xhr.open('PUT', url)
          if (settled)
            return
          if (options.contentType)
            xhr.setRequestHeader('Content-Type', options.contentType)
          // 覆盖从预检查到监听安装/请求准备之间发生的取消，不再进入 send。
          if (signal?.aborted) {
            onCancel()
            return
          }
          xhr.send(body)
        }
        catch (error) {
          finish({
            success: false,
            error: error instanceof Error
              ? error.message
              : storageM('storage_unknownError'),
          })
          xhr.abort()
        }
      })
    }

    // 不需要进度时使用 fetch
    const response = await fetch(url, {
      method: 'PUT',
      body,
      headers: options.contentType
        ? { 'Content-Type': options.contentType }
        : undefined,
      signal,
    })

    if (!response.ok) {
      return transferFailure(operation, storageM('storage_uploadFailedStatus', {
        params: { status: response.status, statusText: response.statusText },
      }), response.status)
    }

    return { success: true }
  }
  catch (error) {
    if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
      return transferFailure(operation, storageM('storage_uploadCanceled'))
    }
    return transferFailure(operation, error instanceof Error
      ? error.message
      : storageM('storage_unknownError'))
  }
}

// ─── 下载功能 ───

/**
 * 使用签名 URL 下载文件
 *
 * @param url - 后端生成的下载签名 URL
 * @param options - 下载选项
 * @returns 下载结果（成功时 data 为 Blob）
 * @example
 * ```ts
 * import { storage } from '@h-ai/storage/client'
 *
 * async function download(url: string) {
 *   const result = await storage.client.downloadWithPresignedUrl(url)
 *   if (!result.success || !result.data) throw new Error(result.error ?? 'Empty download')
 *   return result.data
 * }
 * ```
 */
async function downloadWithPresignedUrl(
  url: string,
  options: ClientDownloadOptions = {},
): Promise<{ success: boolean, data?: Blob, error?: string }> {
  const operation = 'downloadWithPresignedUrl'
  const signal = options.abortController?.signal
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal,
    })

    if (!response.ok) {
      return transferFailure(operation, storageM('storage_downloadFailedStatus', {
        params: { status: response.status, statusText: response.statusText },
      }), response.status)
    }

    const blob = await response.blob()
    return { success: true, data: blob }
  }
  catch (error) {
    if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
      return transferFailure(operation, storageM('storage_downloadCanceled'))
    }
    return transferFailure(operation, error instanceof Error
      ? error.message
      : storageM('storage_unknownError'))
  }
}

/**
 * 下载并保存到本地（浏览器环境）
 *
 * @param url - 下载 URL
 * @param options - 下载选项
 * @returns 成功表示已触发浏览器保存，失败时包含错误说明。
 * @example
 * ```ts
 * import { storage } from '@h-ai/storage/client'
 *
 * async function save(url: string) {
 *   const result = await storage.client.downloadAndSave(url, { filename: 'report.pdf' })
 *   if (!result.success) throw new Error(result.error)
 * }
 * ```
 */
async function downloadAndSave(
  url: string,
  options: ClientDownloadOptions = {},
): Promise<{ success: boolean, error?: string }> {
  const result = await downloadWithPresignedUrl(url, options)

  if (!result.success || !result.data) {
    return { success: false, error: result.error }
  }

  try {
    const link = document.createElement('a')
    const blobUrl = URL.createObjectURL(result.data)
    try {
      link.href = blobUrl
      link.download = options.filename || storageM('storage_downloadDefaultFilename')
      document.body.appendChild(link)
      link.click()
    }
    finally {
      try {
        link.remove()
      }
      finally {
        URL.revokeObjectURL(blobUrl)
      }
    }

    return { success: true }
  }
  catch (error) {
    return transferFailure('downloadAndSave', error instanceof Error
      ? error.message
      : storageM('storage_saveFileFailed'))
  }
}

// ─── 辅助功能 ───

/**
 * 从 File 对象获取文件扩展名
 *
 * 取文件名中最后一个 '.' 之后的部分，转为小写。
 * 没有点号或以点号结尾时返回空字符串；仅前导点号的文件名按其后文本返回扩展名。
 *
 * @param file - 浏览器 File 对象
 * @returns 扩展名（不含点），如 'png'、'tar.gz' 返回 'gz'
 * @example
 * ```ts
 * import { storage } from '@h-ai/storage/client'
 *
 * const extension = storage.client.getFileExtension(new File(['hello'], 'report.txt'))
 * void extension
 * ```
 */
function getFileExtension(file: File): string {
  const name = file.name
  const lastDot = name.lastIndexOf('.')
  return lastDot > -1
    ? name.slice(lastDot + 1).toLowerCase()
    : ''
}

/**
 * 格式化文件大小为人类可读字符串
 *
 * 使用 1024 进制，最大单位为 TB。以 B 为单位时显示整数，其余单位保留 2 位小数。
 *
 * @param bytes - 字节数（非负整数）
 * @returns 格式化后的字符串，如 '0 B'、'1.50 KB'、'2.30 MB'
 * @example
 * ```ts
 * import { storage } from '@h-ai/storage/client'
 *
 * void storage.client.formatFileSize(1536)
 * ```
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0)
    return '0 B'

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const size = bytes / 1024 ** i

  return `${size.toFixed(i > 0
    ? 2
    : 0)} ${units[i]}`
}

/**
 * 客户端操作的模块内部装配；公开入口只通过 storage.client 暴露。
 * @example 模块内部上下文
 * ```ts
 * const mime = client.getMimeType('txt')
 * void mime
 * ```
 */
export const client: ClientOperations = {
  uploadWithPresignedUrl,
  downloadWithPresignedUrl,
  downloadAndSave,
  getFileExtension,
  getMimeType,
  formatFileSize,
}

/**
 * 浏览器与纯客户端子路径的存储入口，无需初始化，也不提供服务端能力。
 * @example
 * ```ts
 * import { storage } from '@h-ai/storage/client'
 *
 * const mime = storage.client.getMimeType('txt')
 * void mime
 * ```
 */
export const storage: { readonly client: ClientOperations } = { client }
