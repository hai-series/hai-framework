/**
 * =============================================================================
 * @hai/storage - 主入口
 * =============================================================================
 * 存储模块，提供:
 * - 统一存储抽象
 * - 多驱动支持 (本地、内存、S3)
 * - 文件元数据管理
 * =============================================================================
 */

// 类型
export type {
  CopyOptions,
  DirectoryMetadata,
  DownloadOptions,
  EncryptionOptions,
  FileMetadata,
  ListOptions,
  ListResult,
  LocalStorageOptions,
  MemoryStorageOptions,
  MoveOptions,
  S3StorageOptions,
  SignedUrlOptions,
  StorageConfig,
  StorageDriver,
  StorageError,
  StorageErrorType,
  UploadOptions,
} from './types.js'

// 驱动
export {
  createLocalStorageDriver,
  LocalStorageDriver,
} from './local.js'

export {
  createMemoryStorageDriver,
  MemoryStorageDriver,
} from './memory.js'

// 管理器
export {
  createLocalStorage,
  createMemoryStorage,
  createStorageManager,
  getStorage,
  initStorage,
  resetStorage,
  StorageManager,
} from './manager.js'

// 工具
export { extension as mimeExtension, lookup as mimeLookup } from './mime.js'
