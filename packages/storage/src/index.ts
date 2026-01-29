/**
 * =============================================================================
 * @hai/storage - 存储模块
 * =============================================================================
 */

// 统一服务入口
export { storage, createStorageService } from './storage.main.js'

// 类型定义
export type * from './storage-types.js'

// HAI Provider 实现
export {
  createHaiFileProvider,
  createHaiDirectoryProvider,
  createHaiUrlProvider,
  createHaiStorageDriver,
} from './provider/hai/storage-hai-provider.js'
