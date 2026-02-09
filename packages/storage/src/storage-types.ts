/**
 * @hai/storage — 公共类型定义
 *
 * 包含：
 * - 错误类型（StorageError）
 * - 文件元数据（FileMetadata）
 * - 列表结果（ListResult）
 * - 文件操作接口（FileOperations）
 * - 目录操作接口（DirOperations）
 * - 签名 URL 操作接口（PresignOperations）
 * - 函数接口（StorageFunctions）
 * - Provider 接口（StorageProvider）
 */

import type { Result } from '@hai/core'
import type { Buffer } from 'node:buffer'
import type { PresignOptions, PresignUploadOptions, StorageConfig, StorageConfigInput, StorageErrorCodeType } from './storage-config.js'

// ─── 错误类型 ───

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

// ─── 文件元数据 ───

/**
 * 文件元数据接口
 *
 * 表示存储中单个文件的元信息，由 put/head/copy/list 等操作返回。
 */
export interface FileMetadata {
  /** 文件键/路径（不含配置 prefix，对用户透明） */
  key: string
  /** 文件大小（字节） */
  size: number
  /** 内容类型（MIME），未指定时根据扩展名自动推断 */
  contentType: string
  /** 最后修改时间 */
  lastModified: Date
  /** ETag（用于缓存验证，本地存储为 MD5，S3 由服务端生成） */
  etag?: string
  /** 自定义元数据键值对 */
  metadata?: Record<string, string>
}

/**
 * 列表选项
 *
 * 用于控制 `storage.dir.list()` 的过滤、分页和目录模拟行为。
 */
export interface ListOptions {
  /** 前缀过滤（只返回以此前缀开头的文件） */
  prefix?: string
  /**
   * 分页标记（从上次 ListResult.nextContinuationToken 获取）
   *
   * 注意：本地存储目前不支持此字段，仅 S3 Provider 有效。
   */
  continuationToken?: string
  /** 每页最大数量（默认 1000） */
  maxKeys?: number
  /** 分隔符（用于模拟目录结构，通常为 '/';传入后子目录作为 commonPrefixes 返回） */
  delimiter?: string
}

/**
 * 列表结果
 *
 * 包含当前页的文件列表、目录前缀、分页信息。
 */
export interface ListResult {
  /** 当前页文件元数据列表 */
  files: FileMetadata[]
  /** 公共前缀（使用 delimiter 时由子目录路径组成） */
  commonPrefixes: string[]
  /** 下一页标记；无后续页时为 undefined */
  nextContinuationToken?: string
  /** 是否被截断（true 表示还有更多数据，可用 nextContinuationToken 继续拉取） */
  isTruncated: boolean
}

// ─── 上传下载选项 ───

/**
 * 上传选项
 *
 * 用于控制 `storage.file.put()` 的元数据与缓存行为。
 */
export interface UploadOptions {
  /** 内容类型（不指定时根据文件扩展名自动推断） */
  contentType?: string
  /** 自定义元数据键值对（存储后可通过 head 获取） */
  metadata?: Record<string, string>
  /** Cache-Control 响应头（例如 'max-age=3600'） */
  cacheControl?: string
  /** Content-Disposition 响应头（例如 'attachment; filename="a.txt"'） */
  contentDisposition?: string
}

/**
 * 下载选项
 *
 * 用于控制 `storage.file.get()` 的范围读取。
 * 两个字段均为字节偏移（含），与 HTTP Range 语义一致。
 */
export interface DownloadOptions {
  /** 范围起始位置（字节，含）；不指定时从文件开头读取 */
  rangeStart?: number
  /** 范围结束位置（字节，含）；不指定时读取到文件末尾 */
  rangeEnd?: number
}

/**
 * 复制选项
 *
 * 用于控制 `storage.file.copy()` 的目标文件元数据。
 * 提供任意字段时，S3 Provider 会使用 MetadataDirective='REPLACE' 覆盖源文件元数据。
 */
export interface CopyOptions {
  /** 目标文件的内容类型（不指定时继承源文件） */
  contentType?: string
  /** 目标文件的自定义元数据（不指定时继承源文件） */
  metadata?: Record<string, string>
}

// ─── 操作接口 ───

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

// ─── 函数接口 ───

/**
 * 存储函数接口
 *
 * 统一的存储访问入口：
 * - `storage.init()` — 初始化存储连接
 * - `storage.close()` — 关闭连接并释放资源
 * - `storage.file` — 文件操作（上传/下载/删除/复制等）
 * - `storage.dir` — 目录操作（列表/删除）
 * - `storage.presign` — 签名 URL 操作
 * - `storage.config` — 当前连接配置（未初始化时为 null）
 * - `storage.isInitialized` — 初始化状态
 */
export interface StorageFunctions {
  /**
   * 初始化存储连接
   *
   * 已有连接时会先 close 再重新初始化。
   *
   * @param config - 存储配置（支持省略带默认值的字段）
   * @returns 成功 ok(undefined)；失败返回 err（含 StorageError）
   */
  init: (config: StorageConfigInput) => Promise<Result<void, StorageError>>

  /**
   * 关闭存储连接并释放资源
   *
   * 重复调用不会报错。
   */
  close: () => Promise<void>

  /** 当前解析后的存储配置；未初始化或已关闭时为 null */
  readonly config: StorageConfig | null

  /** 是否已完成初始化 */
  readonly isInitialized: boolean

  /** 文件操作接口（put / get / head / exists / delete / deleteMany / copy） */
  readonly file: FileOperations

  /** 目录操作接口（list / delete） */
  readonly dir: DirOperations

  /** 签名 URL 操作接口（getUrl / putUrl / publicUrl） */
  readonly presign: PresignOperations
}

// ─── Provider 接口 ───

/**
 * 存储 Provider 接口
 *
 * 由各具体存储实现（S3、Local）实现此接口。
 * Provider 仅在 storage-main 内部使用，不直接对外暴露实例。
 */
export interface StorageProvider {
  /** Provider 名称标识（如 's3'、'local'） */
  readonly name: string

  /**
   * 建立与存储服务的连接
   *
   * @param config - 经 Schema 校验后的完整配置
   * @returns 连接结果
   */
  connect: (config: StorageConfig) => Promise<Result<void, StorageError>>

  /** 关闭连接并释放资源 */
  close: () => Promise<void>

  /** 检查是否已连接 */
  isConnected: () => boolean

  /** 文件操作接口 */
  readonly file: FileOperations

  /** 目录操作接口 */
  readonly dir: DirOperations

  /** 签名 URL 操作接口 */
  readonly presign: PresignOperations
}
