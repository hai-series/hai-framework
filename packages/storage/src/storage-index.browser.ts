/**
 * =============================================================================
 * @hai/storage - 浏览器入口
 * =============================================================================
 * 浏览器环境的轻量入口，仅提供前端客户端能力。
 *
 * 注意：浏览器环境不支持 storage.init / storage.file / storage.dir / storage.presign。
 * 如需服务端能力，请在 Node.js 环境使用 @hai/storage。
 *
 * @example
 * ```ts
 * import { uploadWithPresignedUrl, downloadWithPresignedUrl } from '@hai/storage'
 *
 * // 上传文件
 * const result = await uploadWithPresignedUrl(presignedUrl, file)
 *
 * // 下载文件
 * const download = await downloadWithPresignedUrl(presignedUrl)
 * ```
 * =============================================================================
 */

// 前端客户端
export * from './storage-client.js'

// 类型定义（仅类型导出）
export * from './storage-types.js'
