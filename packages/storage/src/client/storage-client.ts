/**
 * @h-ai/storage — 前端存储客户端
 *
 * 提供前端通过签名 URL 直接上传下载文件的功能。
 * @module storage-client
 */

import { storageM } from '../storage-i18n.js'
import { MIME_TYPE_DEFAULT, MIME_TYPES } from '../storage-mime.js'

// ─── 客户端类型 ───

/**
 * 上传进度回调数据
 *
 * 由 `uploadWithPresignedUrl` 在上传过程中通过 `onProgress` 回调返回。
 */
export interface UploadProgress {
  /** 已上传字节数 */
  loaded: number
  /** 总字节数（仅在 lengthComputable 时可靠） */
  total: number
  /** 进度百分比 (0–100)，四舍五入到整数 */
  percent: number
}

/**
 * 前端上传选项
 *
 * 控制 `uploadWithPresignedUrl` 的行为，包括内容类型、进度监听和取消。
 */
export interface ClientUploadOptions {
  /** 内容类型（设置后会加到请求 Content-Type 头） */
  contentType?: string
  /** 进度回调（设置后会使用 XMLHttpRequest；仅 lengthComputable=true 时回调） */
  onProgress?: (progress: UploadProgress) => void
  /** AbortController 用于取消上传（abort 后返回 {success: false}） */
  abortController?: AbortController
}

/**
 * 前端下载选项
 *
 * 控制 `downloadWithPresignedUrl` / `downloadAndSave` 的行为。
 */
export interface ClientDownloadOptions {
  /** 保存的文件名（仅 downloadAndSave 使用，默认为 'download'） */
  filename?: string
  /** AbortController 用于取消下载（abort 后返回 {success: false}） */
  abortController?: AbortController
}

// ─── 上传功能 ───

/**
 * 使用签名 URL 上传文件
 *
 * @param url - 后端生成的上传签名 URL
 * @param data - 要上传的数据（File、Blob、ArrayBuffer 或字符串）
 * @param options - 上传选项
 * @returns 上传结果
 *
 * @example
 * ```ts
 * // 获取签名 URL（通常从后端 API 获取）
 * const response = await fetch('/api/storage/presign', {
 *     method: 'POST',
 *     body: JSON.stringify({ key: 'uploads/image.png', contentType: 'image/png' })
 * })
 * const { uploadUrl } = await response.json()
 *
 * // 使用签名 URL 上传
 * const file = document.getElementById('fileInput').files[0]
 * const result = await uploadWithPresignedUrl(uploadUrl, file, {
 *     contentType: 'image/png',
 *     onProgress: (p) => {
 *         // 在此更新进度条：p.percent
 *     }
 * })
 *
 * if (result.success) {
 *     // 上传成功
 * }
 * ```
 */
export async function uploadWithPresignedUrl(
  url: string,
  data: File | Blob | ArrayBuffer | string,
  options: ClientUploadOptions = {},
): Promise<{ success: boolean, error?: string }> {
  try {
    // 准备请求体
    const body: BodyInit = data

    // 使用 XMLHttpRequest 以支持上传进度
    if (options.onProgress) {
      return new Promise((resolve) => {
        const xhr = new XMLHttpRequest()

        // 设置取消控制
        if (options.abortController) {
          options.abortController.signal.addEventListener('abort', () => {
            xhr.abort()
            resolve({ success: false, error: storageM('storage_uploadCanceled') })
          })
        }

        // 监听进度
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable && options.onProgress) {
            options.onProgress({
              loaded: event.loaded,
              total: event.total,
              percent: Math.round((event.loaded / event.total) * 100),
            })
          }
        })

        // 监听完成
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve({ success: true })
          }
          else {
            resolve({
              success: false,
              error: storageM('storage_uploadFailedStatus', { params: { status: xhr.status, statusText: xhr.statusText } }),
            })
          }
        })

        // 监听错误
        xhr.addEventListener('error', () => {
          resolve({ success: false, error: storageM('storage_networkError') })
        })

        // 发送请求
        xhr.open('PUT', url)
        if (options.contentType) {
          xhr.setRequestHeader('Content-Type', options.contentType)
        }
        xhr.send(body)
      })
    }

    // 不需要进度时使用 fetch
    const response = await fetch(url, {
      method: 'PUT',
      body,
      headers: options.contentType
        ? { 'Content-Type': options.contentType }
        : undefined,
      signal: options.abortController?.signal,
    })

    if (!response.ok) {
      return {
        success: false,
        error: storageM('storage_uploadFailedStatus', { params: { status: response.status, statusText: response.statusText } }),
      }
    }

    return { success: true }
  }
  catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { success: false, error: storageM('storage_uploadCanceled') }
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : storageM('storage_unknownError'),
    }
  }
}

// ─── 下载功能 ───

/**
 * 使用签名 URL 下载文件
 *
 * @param url - 后端生成的下载签名 URL
 * @param options - 下载选项
 * @returns 下载结果（成功时 data 为 Blob）
 *
 * @example
 * ```ts
 * // 下载为 Blob
 * const result = await downloadWithPresignedUrl(downloadUrl)
 * if (result.success) {
 *     const blob = result.data
 *     // 处理 blob...
 * }
 *
 * // 下载并保存为文件（浏览器环境）
 * await downloadAndSave(downloadUrl, { filename: 'document.pdf' })
 * ```
 */
export async function downloadWithPresignedUrl(
  url: string,
  options: ClientDownloadOptions = {},
): Promise<{ success: boolean, data?: Blob, error?: string }> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: options.abortController?.signal,
    })

    if (!response.ok) {
      return {
        success: false,
        error: storageM('storage_downloadFailedStatus', { params: { status: response.status, statusText: response.statusText } }),
      }
    }

    const blob = await response.blob()
    return { success: true, data: blob }
  }
  catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { success: false, error: storageM('storage_downloadCanceled') }
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : storageM('storage_unknownError'),
    }
  }
}

/**
 * 下载并保存到本地（浏览器环境）
 *
 * @param url - 下载 URL
 * @param options - 下载选项
 *
 * @example
 * ```ts
 * await downloadAndSave(presignedUrl, {
 *     filename: 'report.pdf'
 * })
 * ```
 */
export async function downloadAndSave(
  url: string,
  options: ClientDownloadOptions = {},
): Promise<{ success: boolean, error?: string }> {
  const result = await downloadWithPresignedUrl(url, options)

  if (!result.success || !result.data) {
    return { success: false, error: result.error }
  }

  try {
    // 创建下载链接
    const blobUrl = URL.createObjectURL(result.data)
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = options.filename || storageM('storage_downloadDefaultFilename')

    // 触发下载
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    // 清理 URL
    URL.revokeObjectURL(blobUrl)

    return { success: true }
  }
  catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : storageM('storage_saveFileFailed'),
    }
  }
}

// ─── 辅助功能 ───

/**
 * 从 File 对象获取文件扩展名
 *
 * 取文件名中最后一个 '.' 之后的部分，转为小写。
 * 若文件名无点号或以点号开头且无其他点号，返回空字符串。
 *
 * @param file - 浏览器 File 对象
 * @returns 扩展名（不含点），如 'png'、'tar.gz' 返回 'gz'
 *
 * @example
 * ```ts
 * getFileExtension(new File([], 'photo.PNG'))  // 'png'
 * getFileExtension(new File([], '.gitignore')) // ''
 * ```
 */
export function getFileExtension(file: File): string {
  const name = file.name
  const lastDot = name.lastIndexOf('.')
  return lastDot > -1 ? name.slice(lastDot + 1).toLowerCase() : ''
}

/**
 * 根据文件扩展名获取 MIME 类型
 *
 * 内置常见扩展名映射（图片/文档/文本/音视频/压缩包），
 * 未匹配时返回 'application/octet-stream'。
 *
 * @param extension - 文件扩展名（不含点，大小写不敏感）
 * @returns MIME 类型字符串
 *
 * @example
 * ```ts
 * getMimeType('png')  // 'image/png'
 * getMimeType('xyz')  // 'application/octet-stream'
 * ```
 */
export function getMimeType(extension: string): string {
  return MIME_TYPES[extension.toLowerCase()] || MIME_TYPE_DEFAULT
}

/**
 * 格式化文件大小为人类可读字符串
 *
 * 使用 1024 进制，输出单位为 B/KB/MB/GB/TB。
 * 大于 1 B 时保留 2 位小数。
 *
 * @param bytes - 字节数（非负整数）
 * @returns 格式化后的字符串，如 '0 B'、'1.50 KB'、'2.30 MB'
 *
 * @example
 * ```ts
 * formatFileSize(0)         // '0 B'
 * formatFileSize(1536)      // '1.50 KB'
 * formatFileSize(1048576)   // '1.00 MB'
 * ```
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0)
    return '0 B'

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const size = bytes / 1024 ** i

  return `${size.toFixed(i > 0 ? 2 : 0)} ${units[i]}`
}
