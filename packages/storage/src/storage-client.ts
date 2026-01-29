/**
 * =============================================================================
 * @hai/storage - 前端存储客户端
 * =============================================================================
 *
 * 提供前端通过签名 URL 直接上传下载文件的功能。
 *
 * 使用方式：
 * 1. 后端生成签名 URL 并返回给前端
 * 2. 前端使用此客户端直接上传到存储服务
 *
 * @example
 * ```ts
 * import { uploadWithPresignedUrl, downloadWithPresignedUrl } from '@hai/storage/client'
 *
 * // 上传文件
 * const uploadResult = await uploadWithPresignedUrl(presignedUrl, file, {
 *     onProgress: (progress) => {
 *         // 在此更新进度条：progress.percent
 *     }
 * })
 *
 * // 下载文件
 * await downloadWithPresignedUrl(presignedUrl, {
 *     filename: 'download.pdf'
 * })
 * ```
 *
 * @module storage-client
 * =============================================================================
 */

import type { ClientDownloadOptions, ClientUploadOptions } from './storage-types.js'

// =============================================================================
// 上传功能
// =============================================================================

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
    let body: BodyInit

    if (typeof data === 'string') {
      body = data
    }
    else if (data instanceof ArrayBuffer) {
      body = data
    }
    else {
      body = data
    }

    // 使用 XMLHttpRequest 以支持上传进度
    if (options.onProgress) {
      return new Promise((resolve) => {
        const xhr = new XMLHttpRequest()

        // 设置取消控制
        if (options.abortController) {
          options.abortController.signal.addEventListener('abort', () => {
            xhr.abort()
            resolve({ success: false, error: '上传已取消' })
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
              error: `上传失败（状态码 ${xhr.status}）：${xhr.statusText}`,
            })
          }
        })

        // 监听错误
        xhr.addEventListener('error', () => {
          resolve({ success: false, error: '网络错误' })
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
        error: `上传失败（状态码 ${response.status}）：${response.statusText}`,
      }
    }

    return { success: true }
  }
  catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { success: false, error: '上传已取消' }
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
    }
  }
}

// =============================================================================
// 下载功能
// =============================================================================

/**
 * 使用签名 URL 下载文件
 *
 * @param url - 后端生成的下载签名 URL
 * @param options - 下载选项
 * @returns 下载的数据
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
        error: `下载失败（状态码 ${response.status}）：${response.statusText}`,
      }
    }

    const blob = await response.blob()
    return { success: true, data: blob }
  }
  catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { success: false, error: '下载已取消' }
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
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
    link.download = options.filename || 'download'

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
      error: error instanceof Error ? error.message : '保存文件失败',
    }
  }
}

// =============================================================================
// 辅助功能
// =============================================================================

/**
 * 从 File 对象获取文件扩展名
 *
 * @param file - File 对象
 * @returns 文件扩展名（不含点）
 */
export function getFileExtension(file: File): string {
  const name = file.name
  const lastDot = name.lastIndexOf('.')
  return lastDot > -1 ? name.slice(lastDot + 1).toLowerCase() : ''
}

/**
 * 根据文件扩展名获取 MIME 类型
 *
 * @param extension - 文件扩展名
 * @returns MIME 类型
 */
export function getMimeType(extension: string): string {
  const mimeTypes: Record<string, string> = {
    // 图片
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'ico': 'image/x-icon',

    // 文档
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ppt': 'application/vnd.ms-powerpoint',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',

    // 文本
    'txt': 'text/plain',
    'html': 'text/html',
    'css': 'text/css',
    'js': 'text/javascript',
    'json': 'application/json',
    'xml': 'application/xml',
    'csv': 'text/csv',
    'md': 'text/markdown',

    // 音视频
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'ogg': 'audio/ogg',

    // 压缩包
    'zip': 'application/zip',
    'rar': 'application/x-rar-compressed',
    '7z': 'application/x-7z-compressed',
    'tar': 'application/x-tar',
    'gz': 'application/gzip',
  }

  return mimeTypes[extension.toLowerCase()] || 'application/octet-stream'
}

/**
 * 格式化文件大小
 *
 * @param bytes - 字节数
 * @returns 格式化后的大小字符串
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0)
    return '0 B'

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const size = bytes / 1024 ** i

  return `${size.toFixed(i > 0 ? 2 : 0)} ${units[i]}`
}
