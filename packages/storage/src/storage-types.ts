/**
 * =============================================================================
 * @hai/storage - 类型定义
 * =============================================================================
 *
 * 本文件定义存储模块的核心接口和类型（非配置相关）。
 * 配置相关类型请从 storage-config.ts 导入。
 *
 * 包含：
 * - 错误类型（StorageError）
 * - 文件元数据（FileMetadata）
 * - 列表结果（ListResult）
 * - 文件操作接口（FileOperations）
 * - 目录操作接口（DirOperations）
 * - 签名 URL 操作接口（PresignOperations）
 * - 存储服务接口（StorageService）
 * - Provider 接口（StorageProvider）
 *
 * @example
 * ```ts
 * import type { StorageService, FileMetadata } from '@hai/storage'
 *
 * // 文件元数据
 * const metadata: FileMetadata = {
 *     key: 'uploads/image.png',
 *     size: 1024,
 *     contentType: 'image/png',
 *     lastModified: new Date(),
 *     etag: '"abc123"'
 * }
 * ```
 *
 * @module storage-types
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type { Buffer } from 'node:buffer'
import type { PresignOptions, PresignUploadOptions, StorageConfig, StorageConfigInput, StorageErrorCodeType } from './storage-config.js'

// =============================================================================
// 错误类型
// =============================================================================

/**
 * 存储错误接口
 *
 * 所有存储操作返回的错误都遵循此接口。
 *
 * @example
 * ```ts
 * const result = await storage.file.get('image.png')
 * if (!result.success) {
 *     const error: StorageError = result.error
 *     // 处理错误：根据 error.code / error.message 做兜底
 * }
 * ```
 */
export interface StorageError {
  /** 错误码（数值，参见 StorageErrorCode） */
  code: StorageErrorCodeType
  /** 错误消息 */
  message: string
  /** 相关的文件路径/键 */
  key?: string
  /** 原始错误（可选） */
  cause?: unknown
}

// =============================================================================
// 文件元数据
// =============================================================================

/**
 * 文件元数据接口
 *
 * 表示存储中文件的元数据信息。
 */
export interface FileMetadata {
  /** 文件键/路径 */
  key: string
  /** 文件大小（bytes） */
  size: number
  /** 内容类型（MIME） */
  contentType: string
  /** 最后修改时间 */
  lastModified: Date
  /** ETag（用于缓存验证） */
  etag?: string
  /** 自定义元数据 */
  metadata?: Record<string, string>
}

/**
 * 列表选项
 */
export interface ListOptions {
  /** 前缀过滤 */
  prefix?: string
  /** 分页标记（从上次结果获取） */
  continuationToken?: string
  /** 每页最大数量 */
  maxKeys?: number
  /** 分隔符（用于模拟目录结构） */
  delimiter?: string
}

/**
 * 列表结果
 */
export interface ListResult {
  /** 文件列表 */
  files: FileMetadata[]
  /** 公共前缀（模拟目录） */
  commonPrefixes: string[]
  /** 下一页标记 */
  nextContinuationToken?: string
  /** 是否被截断（还有更多） */
  isTruncated: boolean
}

// =============================================================================
// 上传下载选项
// =============================================================================

/**
 * 上传选项
 */
export interface UploadOptions {
  /** 内容类型 */
  contentType?: string
  /** 自定义元数据 */
  metadata?: Record<string, string>
  /** 缓存控制 */
  cacheControl?: string
  /** 内容处置 */
  contentDisposition?: string
}

/**
 * 下载选项
 */
export interface DownloadOptions {
  /** 范围起始（bytes） */
  rangeStart?: number
  /** 范围结束（bytes） */
  rangeEnd?: number
}

/**
 * 复制选项
 */
export interface CopyOptions {
  /** 目标内容类型 */
  contentType?: string
  /** 目标元数据 */
  metadata?: Record<string, string>
}

// =============================================================================
// 操作接口
// =============================================================================

/**
 * 文件操作接口
 *
 * 提供文件的读写操作。
 */
export interface FileOperations {
  /**
   * 上传文件
   *
   * @param key - 文件键/路径
   * @param data - 文件内容（Buffer、Uint8Array 或字符串）
   * @param options - 上传选项
   * @returns 上传结果包含文件元数据
   * @example
   * ```ts
   * const result = await storage.file.put('uploads/a.txt', 'hello')
   * if (result.success) {
   *   result.data.key
   * }
   * ```
   */
  put: (key: string, data: Buffer | Uint8Array | string, options?: UploadOptions) => Promise<Result<FileMetadata, StorageError>>

  /**
   * 下载文件
   *
   * @param key - 文件键/路径
   * @param options - 下载选项
   * @returns 文件内容
   * @example
   * ```ts
   * const result = await storage.file.get('uploads/a.txt')
   * if (result.success) {
   *   const buffer = result.data
   * }
   * ```
   */
  get: (key: string, options?: DownloadOptions) => Promise<Result<Buffer, StorageError>>

  /**
   * 获取文件元数据
   *
   * @param key - 文件键/路径
   * @returns 文件元数据
   * @example
   * ```ts
   * const result = await storage.file.head('uploads/a.txt')
   * if (result.success) {
   *   result.data.size
   * }
   * ```
   */
  head: (key: string) => Promise<Result<FileMetadata, StorageError>>

  /**
   * 检查文件是否存在
   *
   * @param key - 文件键/路径
   * @returns 是否存在
   * @example
   * ```ts
   * const result = await storage.file.exists('uploads/a.txt')
   * if (result.success) {
   *   result.data
   * }
   * ```
   */
  exists: (key: string) => Promise<Result<boolean, StorageError>>

  /**
   * 删除文件
   *
   * @param key - 文件键/路径
   * @returns 删除结果
   * @example
   * ```ts
   * await storage.file.delete('uploads/a.txt')
   * ```
   */
  delete: (key: string) => Promise<Result<void, StorageError>>

  /**
   * 批量删除文件
   *
   * @param keys - 文件键/路径列表
   * @returns 删除结果
   * @example
   * ```ts
   * await storage.file.deleteMany(['a.txt', 'b.txt'])
   * ```
   */
  deleteMany: (keys: string[]) => Promise<Result<void, StorageError>>

  /**
   * 复制文件
   *
   * @param sourceKey - 源文件键
   * @param destKey - 目标文件键
   * @param options - 复制选项
   * @returns 目标文件元数据
   * @example
   * ```ts
   * await storage.file.copy('a.txt', 'b.txt')
   * ```
   */
  copy: (sourceKey: string, destKey: string, options?: CopyOptions) => Promise<Result<FileMetadata, StorageError>>
}

/**
 * 目录操作接口
 *
 * 提供目录（前缀）的列表操作。
 */
export interface DirOperations {
  /**
   * 列出目录内容
   *
   * @param options - 列表选项
   * @returns 文件和目录列表
   * @example
   * ```ts
   * const result = await storage.dir.list({ prefix: 'uploads/' })
   * if (result.success) {
   *   result.data.files
   * }
   * ```
   */
  list: (options?: ListOptions) => Promise<Result<ListResult, StorageError>>

  /**
   * 删除目录（删除指定前缀下的所有文件）
   *
   * @param prefix - 目录前缀
   * @returns 删除结果
   * @example
   * ```ts
   * await storage.dir.delete('uploads/tmp/')
   * ```
   */
  delete: (prefix: string) => Promise<Result<void, StorageError>>
}

/**
 * 签名 URL 操作接口
 *
 * 提供生成临时授权 URL 的功能，支持前端直接上传下载。
 */
export interface PresignOperations {
  /**
   * 生成下载签名 URL
   *
   * @param key - 文件键/路径
   * @param options - 签名选项
   * @returns 签名 URL
   * @example
   * ```ts
   * const result = await storage.presign.getUrl('a.txt', { expiresIn: 60 })
   * ```
   */
  getUrl: (key: string, options?: PresignOptions) => Promise<Result<string, StorageError>>

  /**
   * 生成上传签名 URL
   *
   * @param key - 文件键/路径
   * @param options - 上传签名选项
   * @returns 签名 URL
   * @example
   * ```ts
   * const result = await storage.presign.putUrl('a.txt', { contentType: 'text/plain' })
   * ```
   */
  putUrl: (key: string, options?: PresignUploadOptions) => Promise<Result<string, StorageError>>

  /**
   * 获取公开访问 URL（如果配置了 publicUrl）
   *
   * @param key - 文件键/路径
   * @returns 公开 URL，如果未配置 publicUrl 则返回 null
   * @example
   * ```ts
   * const url = storage.presign.publicUrl('a.txt')
   * ```
   */
  publicUrl: (key: string) => string | null
}

// =============================================================================
// 前端客户端操作接口
// =============================================================================

/**
 * 前端客户端操作接口
 */
export interface StorageClientOperations {
  /**
   * 使用签名 URL 上传文件
   * @example
   * ```ts
   * const result = await storage.client.uploadWithPresignedUrl(url, file)
   * ```
   */
  uploadWithPresignedUrl: (
    url: string,
    data: File | Blob | ArrayBuffer | string,
    options?: ClientUploadOptions,
  ) => Promise<{ success: boolean, error?: string }>

  /**
   * 使用签名 URL 下载文件
   * @example
   * ```ts
   * const result = await storage.client.downloadWithPresignedUrl(url)
   * ```
   */
  downloadWithPresignedUrl: (
    url: string,
    options?: ClientDownloadOptions,
  ) => Promise<{ success: boolean, data?: Blob, error?: string }>

  /**
   * 下载并保存到本地（浏览器环境）
   * @example
   * ```ts
   * await storage.client.downloadAndSave(url, { filename: 'report.pdf' })
   * ```
   */
  downloadAndSave: (
    url: string,
    options?: ClientDownloadOptions,
  ) => Promise<{ success: boolean, error?: string }>

  /**
   * 从 File 对象获取文件扩展名
   * @example
   * ```ts
   * const ext = storage.client.getFileExtension(file)
   * ```
   */
  getFileExtension: (file: File) => string

  /**
   * 根据文件扩展名获取 MIME 类型
   * @example
   * ```ts
   * const type = storage.client.getMimeType('png')
   * ```
   */
  getMimeType: (extension: string) => string

  /**
   * 格式化文件大小
   * @example
   * ```ts
   * const text = storage.client.formatFileSize(2048)
   * ```
   */
  formatFileSize: (bytes: number) => string
}

// =============================================================================
// 复合存储操作接口
// =============================================================================

/**
 * 复合存储操作接口
 *
 * 在基础操作之上，包含文件/目录/签名 URL 操作。
 */
export interface StorageCompositeOperations {
  /** 文件操作 */
  readonly file: FileOperations
  /** 目录操作 */
  readonly dir: DirOperations
  /** 签名 URL 操作 */
  readonly presign: PresignOperations
}

// =============================================================================
// 存储服务接口
// =============================================================================

/**
 * 存储服务接口
 *
 * 统一的存储访问入口，提供以下功能：
 * - `storage.init()` - 初始化存储连接
 * - `storage.close()` - 关闭连接
 * - `storage.file` - 文件操作
 * - `storage.dir` - 目录操作
 * - `storage.presign` - 签名 URL 操作（用于前端直接上传下载）
 * - `storage.config` - 当前配置
 * - `storage.isInitialized` - 初始化状态
 */
export interface StorageService extends StorageCompositeOperations {
  /** 前端客户端操作（如签名 URL 上传下载） */
  readonly client: StorageClientOperations
  /** 当前配置 */
  readonly config: StorageConfig | null
  /** 是否已初始化 */
  readonly isInitialized: boolean
  /**
   * 初始化存储连接
   * @example
   * ```ts
   * await storage.init({ type: 'local', root: '/data/uploads' })
   * ```
   */
  init: (config: StorageConfigInput) => Promise<Result<void, StorageError>>
  /**
   * 关闭连接
   * @example
   * ```ts
   * await storage.close()
   * ```
   */
  close: () => Promise<void>
}

// =============================================================================
// Provider 接口
// =============================================================================

/**
 * 存储 Provider 接口
 *
 * 由各具体存储实现（S3、Local）实现此接口。
 */
export interface StorageProvider extends StorageCompositeOperations {
  /** Provider 名称 */
  readonly name: string

  /**
   * 初始化连接
   *
   * @param config - 存储配置
   * @example
   * ```ts
   * await provider.connect(config)
   * ```
   */
  connect: (config: StorageConfig) => Promise<Result<void, StorageError>>

  /**
   * 关闭连接
   * @example
   * ```ts
   * await provider.close()
   * ```
   */
  close: () => Promise<void>

  /**
   * 检查是否已连接
   * @example
   * ```ts
   * const ok = provider.isConnected()
   * ```
   */
  isConnected: () => boolean
}

// =============================================================================
// 前端客户端类型
// =============================================================================

/**
 * 前端存储客户端接口
 *
 * 用于前端通过签名 URL 直接上传下载文件。
 */
export interface StorageClientOptions {
  /** 后端 API 基础 URL */
  apiBaseUrl: string
  /** 获取 access token 的函数 */
  getAccessToken?: () => string | Promise<string>
}

/**
 * 上传进度回调
 */
export interface UploadProgress {
  /** 已上传字节数 */
  loaded: number
  /** 总字节数 */
  total: number
  /** 进度百分比 (0-100) */
  percent: number
}

/**
 * 前端上传选项
 */
export interface ClientUploadOptions {
  /** 内容类型 */
  contentType?: string
  /** 进度回调 */
  onProgress?: (progress: UploadProgress) => void
  /** AbortController 用于取消上传 */
  abortController?: AbortController
}

/**
 * 前端下载选项
 */
export interface ClientDownloadOptions {
  /** 保存的文件名 */
  filename?: string
  /** AbortController 用于取消下载 */
  abortController?: AbortController
}
