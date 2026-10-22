/**
 * @h-ai/storage — 公共类型定义
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
 * @module storage-types
 */

import type { ErrorInfo, HaiError, HaiResult } from '@h-ai/core'
import type { Buffer } from 'node:buffer'
import type { PresignOptions, PresignUploadOptions, StorageConfig, StorageConfigInput } from './storage-config.js'
import { core } from '@h-ai/core'

// ─── 错误定义（照 @h-ai/core 范式） ───

const StorageErrorInfo = {
  CONNECTION_FAILED: '001:500',
  OPERATION_FAILED: '002:500',
  NOT_FOUND: '003:404',
  ALREADY_EXISTS: '004:409',
  PERMISSION_DENIED: '005:403',
  QUOTA_EXCEEDED: '006:413',
  INVALID_PATH: '007:400',
  IO_ERROR: '008:500',
  NETWORK_ERROR: '009:502',
  NOT_INITIALIZED: '010:500',
  UNSUPPORTED_TYPE: '011:400',
  CONFIG_ERROR: '012:500',
  PRESIGN_FAILED: '013:500',
  UPLOAD_FAILED: '014:500',
  DOWNLOAD_FAILED: '015:500',
  CHECKSUM_FAILED: '016:500',
  INVALID_CHECKSUM: '017:400',
  UNSUPPORTED_OPERATION: '018:400',
  INVALID_LIST_OPTIONS: '019:400',
} as const satisfies ErrorInfo

export const HaiStorageError = core.error.buildHaiErrorsDef('storage', StorageErrorInfo)

/**
 * 批量删除中未确认完成的一项；key 始终使用调用方视角，不含 Provider prefix。
 * @example const failure: StorageDeleteFailure = { key: 'private.txt', code: 'AccessDenied', retryable: false, outcome: 'failed' }
 */
export interface StorageDeleteFailure {
  /** 调用方提交的文件键。 */
  key: string
  /** 渠道/框架错误标识，不包含渠道原始 Message。 */
  code: string
  /** 是否属于可重试的瞬时故障；未知结果重试前仍需考虑并发上传/版本语义。 */
  retryable: boolean
  /** failed 为已知失败，unknown 为已发送但结果未知，notAttempted 为尚未发送。 */
  outcome: 'failed' | 'unknown' | 'notAttempted'
}

/**
 * 批量删除进度；任一失败不能宣称全部删除完成。
 * @example const summary: StorageDeleteSummary = { deletedKeys: ['a.txt'], failures: [] }
 */
export interface StorageDeleteSummary {
  /** 已确认删除或本来就不存在的唯一文件键。 */
  deletedKeys: string[]
  /** 失败、未知及尚未尝试的唯一文件键。 */
  failures: StorageDeleteFailure[]
}

/**
 * 批量删除结果；失败仍遵守 HaiResult，部分进度置于 error.ext.deleteMany。
 * @example
 * const result = await storage.file.deleteMany(['a.txt', 'b.txt'])
 * const summary = result.success ? result.data : result.error.ext?.deleteMany
 */
export type StorageDeleteResult
  = | { success: true, data: StorageDeleteSummary }
    | { success: false, error: HaiError & { ext?: Record<string, unknown> & { deleteMany?: StorageDeleteSummary } } }

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
  /** ETag（缓存验证标记；本地为 size-mtime，S3 由服务端生成，不等同于内容 checksum） */
  etag?: string
  /** 自定义元数据键值对 */
  metadata?: Record<string, string>
}

/**
 * 列表选项
 *
 * 用于控制 `storage.dir.list()` 的过滤、分页和目录模拟行为。
 *
 * @example
 * const options: ListOptions = { prefix: 'reports/2026-', delimiter: '/', maxKeys: 100 }
 */
export interface ListOptions {
  /** 前缀过滤（只返回以此前缀开头的文件） */
  prefix?: string
  /**
   * 分页标记（从上次 ListResult.nextContinuationToken 获取）
   *
   * Local 游标绑定根目录、prefix 和 delimiter，可跨实例使用；不得跨查询或 provider 混用。
   */
  continuationToken?: string
  /** 每页逻辑条目上限（1–1000，默认 1000）；files 和 commonPrefixes 合计计数。 */
  maxKeys?: number
  /** 分隔符，通常为 '/'；从 prefix 之后首次出现的位置折叠 commonPrefixes，空字符串表示不折叠。 */
  delimiter?: string
}

/**
 * 列表结果
 *
 * 包含当前页的文件列表、目录前缀、分页信息。
 *
 * @example
 * const page = await storage.dir.list({ prefix: 'reports/', maxKeys: 100 })
 * if (page.success && page.data.isTruncated) {
 *   const next = await storage.dir.list({ prefix: 'reports/', continuationToken: page.data.nextContinuationToken })
 * }
 */
export interface ListResult {
  /** 当前页文件元数据列表 */
  files: FileMetadata[]
  /** 公共前缀：由实际匹配文件按 delimiter 折叠，不包含 Local 空物理目录。 */
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
  /** 仅当 key 不存在时原子写入；S3 使用标准 If-None-Match，后端不支持时返回错误。 */
  ifNoneMatch?: '*'
  /** 取消上传；失败或取消时清理未完成的临时文件/分片。 */
  signal?: AbortSignal
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
  /** 取消读取。 */
  signal?: AbortSignal
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

/** 文件内容；异步字节流支持 Node Readable 等，不将整个文件载入内存。 */
export type StorageData = Buffer | Uint8Array | string | AsyncIterable<Uint8Array>

/** 常见 checksum 算法；MD5/SHA-1 仅用于兼容性完整性校验，不用于安全认证。 */
export type ChecksumAlgorithm = 'sha256' | 'sha384' | 'sha512' | 'sha1' | 'md5'

/** checksum 计算选项；默认 SHA-256、小写 hex。 */
export interface ChecksumOptions {
  algorithm?: ChecksumAlgorithm
  encoding?: 'hex' | 'base64'
  signal?: AbortSignal
}

/** Node 端无状态 checksum 工具，不依赖 storage.init；流输入仅消费一次。 */
export interface ChecksumOperations {
  generate: (data: StorageData, options?: ChecksumOptions) => Promise<HaiResult<string>>
  verify: (data: StorageData, expected: string, options?: ChecksumOptions) => Promise<HaiResult<boolean>>
}

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
   * @param data - 文件内容（Buffer、Uint8Array、字符串或异步字节流）
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
  put: (key: string, data: StorageData, options?: UploadOptions) => Promise<HaiResult<FileMetadata>>

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
  get: (key: string, options?: DownloadOptions) => Promise<HaiResult<Buffer>>

  /**
   * 读取字节流，支持 Range 与取消；消费方负责及时迭代或关闭流。
   * @throws 迭代期间的 I/O/取消错误；初始请求失败通过 HaiResult 返回。
   */
  getStream: (key: string, options?: DownloadOptions) => Promise<HaiResult<AsyncIterable<Uint8Array>>>

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
  head: (key: string) => Promise<HaiResult<FileMetadata>>

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
  exists: (key: string) => Promise<HaiResult<boolean>>

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
  delete: (key: string) => Promise<HaiResult<void>>

  /**
   * 批量删除文件
   *
   * @param keys - 文件键/路径列表
   * @returns 全部成功时返回进度；任一失败时 success=false，进度在 error.ext.deleteMany
   * @example
   * ```ts
   * const result = await storage.file.deleteMany(['a.txt', 'b.txt'])
   * const progress = result.success ? result.data : result.error.ext?.deleteMany
   * ```
   */
  deleteMany: (keys: string[]) => Promise<StorageDeleteResult>

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
  copy: (sourceKey: string, destKey: string, options?: CopyOptions) => Promise<HaiResult<FileMetadata>>
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
  list: (options?: ListOptions) => Promise<HaiResult<ListResult>>

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
  delete: (prefix: string) => Promise<HaiResult<void>>
}

/**
 * 签名 URL 操作接口
 *
 * S3 provider 提供临时授权 URL，支持前端直接上传下载。
 * local 的 getUrl/putUrl 返回 UNSUPPORTED_OPERATION，publicUrl 返回 null。
 */
export interface PresignOperations {
  /**
   * 生成下载签名 URL
   *
   * @param key - 文件键/路径
   * @param options - 签名选项
   * @returns 成功时为可访问的 S3 签名 URL；local 返回 UNSUPPORTED_OPERATION。
   * @example
   * ```ts
   * const result = await storage.presign.getUrl('a.txt', { expiresIn: 60 })
   * if (!result.success) return result
   * const downloadUrl = result.data
   * ```
   */
  getUrl: (key: string, options?: PresignOptions) => Promise<HaiResult<string>>

  /**
   * 生成上传签名 URL
   *
   * @param key - 文件键/路径
   * @param options - 上传签名选项
   * @returns 成功时为可访问的 S3 签名 URL；local 返回 UNSUPPORTED_OPERATION。
   * @example
   * ```ts
   * const result = await storage.presign.putUrl('a.txt', { contentType: 'text/plain' })
   * if (!result.success) return result
   * const uploadUrl = result.data
   * ```
   */
  putUrl: (key: string, options?: PresignUploadOptions) => Promise<HaiResult<string>>

  /**
   * 获取公开访问 URL（如果配置了 publicUrl）
   *
   * @param key - 文件键/路径
   * @returns 公开 URL；S3 未配置 publicUrl 或 local provider 均返回 null。
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
 * - `storage.config` — 当前脱敏配置快照（未初始化时为 null）
 * - `storage.isInitialized` — 初始化状态
 */
export interface StorageFunctions {
  /** 无状态 checksum 生成与校验，Node 专用，无需初始化。 */
  readonly checksum: ChecksumOperations
  /**
   * 初始化存储连接
   *
   * 已有连接时会先 close 再重新初始化。
   *
   * @param config - 存储配置（支持省略带默认值的字段）
   * @returns 成功 ok(undefined)；失败返回 err（含 StorageError）
   */
  init: (config: StorageConfigInput) => Promise<HaiResult<void>>

  /**
   * 关闭存储连接并释放资源
   *
   * 等待初始化并合并并发关闭；失败时操作不可用，资源保留供 close/init 重试。
   * @returns 所有资源释放成功才返回成功；未初始化时同样成功。
   * @example
   * const closed = await storage.close()
   * if (!closed.success) await storage.close()
   */
  close: () => Promise<HaiResult<void>>

  /** 当前脱敏后的存储配置快照；未初始化或已关闭时为 null */
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
  connect: (config: StorageConfig) => Promise<HaiResult<void>>

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
