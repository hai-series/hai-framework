/**
 * @h-ai/storage/client — 前端存储客户端入口
 *
 * 提供通过签名 URL 直接上传/下载文件的能力，
 * 以及 MIME 类型查询、文件大小格式化等 storage.client 操作，无需初始化。
 * @module index
 */
export type { ClientDownloadOptions, ClientOperations, ClientUploadOptions, UploadProgress } from '../storage-types.js'
export { storage } from './storage-client.js'
