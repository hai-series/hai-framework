/**
 * =============================================================================
 * @hai/kit - Storage 模块导出
 * =============================================================================
 * SvelteKit 与 @hai/storage 集成
 *
 * 包含：
 * - createStorageEndpoint - 创建存储 API 端点
 * =============================================================================
 */

// API 端点
export { createStorageEndpoint } from './storage-handle.js'

// 类型
export type {
  PresignResult,
  StorageEndpointConfig,
  StorageFileItem,
  StorageServiceLike,
  StorageUploadResult,
} from './storage-types.js'
