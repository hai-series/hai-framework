/**
 * =============================================================================
 * @hai/storage - 存储服务主入口
 * =============================================================================
 *
 * 本文件提供统一的 `storage` 对象，聚合所有存储操作功能。
 *
 * 使用方式：
 * 1. 调用 `initStorage()` 初始化存储连接
 * 2. 通过 `storage.file` 进行文件操作
 * 3. 通过 `storage.dir` 进行目录操作
 * 4. 通过 `storage.presign` 生成签名 URL（支持前端直传）
 * 5. 调用 `closeStorage()` 关闭连接
 *
 * @example
 * ```ts
 * import { storage, initStorage, closeStorage } from '@hai/storage'
 *
 * // 1. 初始化存储（S3 或兼容协议）
 * await initStorage({
 *     type: 's3',
 *     bucket: 'my-bucket',
 *     region: 'us-east-1',
 *     accessKeyId: 'xxx',
 *     secretAccessKey: 'xxx'
 * })
 *
 * // 2. 上传文件
 * await storage.file.put('uploads/image.png', imageBuffer, {
 *     contentType: 'image/png'
 * })
 *
 * // 3. 获取文件
 * const result = await storage.file.get('uploads/image.png')
 *
 * // 4. 列出文件
 * const list = await storage.dir.list({ prefix: 'uploads/' })
 *
 * // 5. 生成签名 URL（前端直接下载）
 * const downloadUrl = await storage.presign.getUrl('uploads/image.png', {
 *     expiresIn: 3600
 * })
 *
 * // 6. 生成上传签名 URL（前端直接上传）
 * const uploadUrl = await storage.presign.putUrl('uploads/new-file.png', {
 *     contentType: 'image/png',
 *     expiresIn: 3600
 * })
 *
 * // 7. 关闭连接
 * await closeStorage()
 * ```
 *
 * @module storage-main
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type {
  DirOperations,
  FileOperations,
  PresignOperations,
  StorageConfig,
  StorageConfigInput,
  StorageError,
  StorageProvider,
  StorageService,
} from './storage-types.js'

import { err } from '@hai/core'

import { getStorageMessage } from './index.js'

import { createLocalProvider } from './provider/storage-provider-local.js'
import { createS3Provider } from './provider/storage-provider-s3.js'
import { StorageConfigSchema, StorageErrorCode } from './storage-config.js'

// =============================================================================
// 内部状态
// =============================================================================

/** 当前活跃的存储 Provider */
let currentProvider: StorageProvider | null = null

/** 当前存储配置 */
let currentConfig: StorageConfig | null = null

// =============================================================================
// Provider 工厂
// =============================================================================

/**
 * 根据配置创建对应的存储 Provider
 *
 * @param config - 存储配置
 * @returns 对应类型的 Provider 实例
 * @throws 不支持的存储类型时抛出错误
 */
function createProvider(config: StorageConfig): StorageProvider {
  switch (config.type) {
    case 's3':
      return createS3Provider()
    case 'local':
      return createLocalProvider()
    default:
      throw new Error(`Unsupported storage type: ${(config as StorageConfig).type}`)
  }
}

// =============================================================================
// 未初始化时的错误处理
// =============================================================================

/**
 * 创建未初始化错误
 */
function notInitializedError(): StorageError {
  return {
    code: StorageErrorCode.NOT_INITIALIZED,
    message: getStorageMessage('storage_notInitialized'),
  }
}

/** 未初始化时的文件操作占位 */
const notInitializedFile: FileOperations = {
  put: async () => err(notInitializedError()),
  get: async () => err(notInitializedError()),
  head: async () => err(notInitializedError()),
  exists: async () => err(notInitializedError()),
  delete: async () => err(notInitializedError()),
  deleteMany: async () => err(notInitializedError()),
  copy: async () => err(notInitializedError()),
}

/** 未初始化时的目录操作占位 */
const notInitializedDir: DirOperations = {
  list: async () => err(notInitializedError()),
  delete: async () => err(notInitializedError()),
}

/** 未初始化时的签名 URL 操作占位 */
const notInitializedPresign: PresignOperations = {
  getUrl: async () => err(notInitializedError()),
  putUrl: async () => err(notInitializedError()),
  publicUrl: () => null,
}

// =============================================================================
// 统一存储服务对象
// =============================================================================

/**
 * 存储服务对象
 *
 * 统一的存储访问入口，提供以下功能：
 * - `storage.init()` - 初始化存储连接
 * - `storage.close()` - 关闭连接
 * - `storage.file` - 文件操作（put, get, head, exists, delete, copy）
 * - `storage.dir` - 目录操作（list, delete）
 * - `storage.presign` - 签名 URL 操作（getUrl, putUrl, publicUrl）
 * - `storage.config` - 当前配置
 * - `storage.isInitialized` - 初始化状态
 *
 * @example
 * ```ts
 * import { storage } from '@hai/storage'
 *
 * // 初始化
 * await storage.init({
 *     type: 's3',
 *     bucket: 'my-bucket',
 *     region: 'us-east-1',
 *     accessKeyId: 'xxx',
 *     secretAccessKey: 'xxx'
 * })
 *
 * // 文件操作
 * await storage.file.put('test.txt', 'Hello World')
 * const data = await storage.file.get('test.txt')
 *
 * // 目录操作
 * const files = await storage.dir.list({ prefix: 'uploads/' })
 *
 * // 签名 URL（用于前端直传）
 * const uploadUrl = await storage.presign.putUrl('upload.png', {
 *     contentType: 'image/png',
 *     expiresIn: 3600
 * })
 *
 * // 关闭连接
 * await storage.close()
 * ```
 */
export const storage: StorageService = {
  /** 获取文件操作接口 */
  get file(): FileOperations {
    return currentProvider?.file ?? notInitializedFile
  },

  /** 获取目录操作接口 */
  get dir(): DirOperations {
    return currentProvider?.dir ?? notInitializedDir
  },

  /** 获取签名 URL 操作接口 */
  get presign(): PresignOperations {
    return currentProvider?.presign ?? notInitializedPresign
  },

  /** 获取当前配置 */
  get config(): StorageConfig | null {
    return currentConfig
  },

  /** 检查是否已初始化 */
  get isInitialized(): boolean {
    return currentProvider !== null && currentProvider.isConnected()
  },

  /** 初始化存储连接 */
  async init(config: StorageConfigInput): Promise<Result<void, StorageError>> {
    // 如果已有连接，先关闭
    if (currentProvider) {
      await storage.close()
    }

    try {
      // 运行时补齐默认值并校验配置（测试场景常用“最小配置”）
      const normalizedConfig = StorageConfigSchema.parse(config)

      // 创建 Provider
      const provider = createProvider(normalizedConfig)

      // 连接
      const result = await provider.connect(normalizedConfig)
      if (!result.success) {
        return result
      }

      // 保存状态
      currentProvider = provider
      currentConfig = normalizedConfig

      return result
    }
    catch (error) {
      return err({
        code: StorageErrorCode.CONNECTION_FAILED,
        message: error instanceof Error ? error.message : 'Unknown error',
        cause: error,
      })
    }
  },

  /** 关闭存储连接 */
  async close(): Promise<void> {
    if (currentProvider) {
      await currentProvider.close()
      currentProvider = null
      currentConfig = null
    }
  },
}
