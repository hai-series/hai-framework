/**
 * =============================================================================
 * @hai/storage - 类型定义
 * =============================================================================
 * 定义存储模块的所有接口和类型
 * =============================================================================
 */

import type { Result } from '@hai/core'

// =============================================================================
// Provider 定义
// =============================================================================

/**
 * 存储服务提供者类型
 */
export type StorageProvider = 'hai' | 'supabase' | 'firebase' | 's3' | 'gcs' | 'azure' | 'custom'

/**
 * 存储驱动类型
 */
export type StorageDriverType = 'local' | 'memory' | 's3' | 'gcs' | 'azure'

/**
 * 存储服务配置
 */
export interface StorageServiceConfig {
    /** 提供者类型 */
    provider: StorageProvider
    /** 驱动类型 */
    driver: StorageDriverType
    /** 驱动配置 */
    options: LocalStorageOptions | MemoryStorageOptions | S3StorageOptions
    /** 默认加密配置 */
    defaultEncryption?: EncryptionOptions
    /** 自定义配置 */
    custom?: Record<string, unknown>
}

// =============================================================================
// 错误类型
// =============================================================================

/**
 * 存储错误类型
 */
export type StorageErrorType =
    | 'NOT_FOUND'
    | 'ALREADY_EXISTS'
    | 'PERMISSION_DENIED'
    | 'QUOTA_EXCEEDED'
    | 'INVALID_PATH'
    | 'IO_ERROR'
    | 'NETWORK_ERROR'
    | 'ENCRYPTION_ERROR'
    | 'PROVIDER_NOT_FOUND'

/**
 * 存储错误
 */
export interface StorageError {
    type: StorageErrorType
    message: string
    path?: string
}

// =============================================================================
// 元数据类型
// =============================================================================

/**
 * 文件元数据
 */
export interface FileMetadata {
    /** 文件路径 */
    path: string
    /** 文件名 */
    name: string
    /** 文件大小 (bytes) */
    size: number
    /** MIME 类型 */
    mimeType: string
    /** 创建时间 */
    createdAt: Date
    /** 修改时间 */
    updatedAt: Date
    /** ETag */
    etag?: string
    /** 自定义元数据 */
    customMetadata?: Record<string, string>
}

/**
 * 目录元数据
 */
export interface DirectoryMetadata {
    /** 目录路径 */
    path: string
    /** 目录名 */
    name: string
    /** 创建时间 */
    createdAt: Date
}

// =============================================================================
// 操作选项类型
// =============================================================================

/**
 * 列表选项
 */
export interface ListOptions {
    /** 前缀过滤 */
    prefix?: string
    /** 分页游标 */
    cursor?: string
    /** 每页数量 */
    limit?: number
    /** 是否递归 */
    recursive?: boolean
}

/**
 * 列表结果
 */
export interface ListResult {
    /** 文件列表 */
    files: FileMetadata[]
    /** 目录列表 */
    directories: DirectoryMetadata[]
    /** 下一页游标 */
    nextCursor?: string
    /** 是否有更多 */
    hasMore: boolean
}

/**
 * 上传选项
 */
export interface UploadOptions {
    /** 自定义元数据 */
    metadata?: Record<string, string>
    /** MIME 类型 */
    contentType?: string
    /** 加密选项 */
    encryption?: EncryptionOptions
    /** 是否覆盖 */
    overwrite?: boolean
}

/**
 * 下载选项
 */
export interface DownloadOptions {
    /** 范围起始 (bytes) */
    rangeStart?: number
    /** 范围结束 (bytes) */
    rangeEnd?: number
    /** 解密选项 */
    encryption?: EncryptionOptions
}

/**
 * 加密选项
 */
export interface EncryptionOptions {
    /** 是否启用加密 */
    enabled: boolean
    /** 加密密钥 (SM4) */
    key?: string
}

/**
 * 复制选项
 */
export interface CopyOptions {
    /** 是否覆盖目标 */
    overwrite?: boolean
    /** 保留元数据 */
    preserveMetadata?: boolean
}

/**
 * 移动选项
 */
export interface MoveOptions {
    /** 是否覆盖目标 */
    overwrite?: boolean
}

/**
 * URL 签名选项
 */
export interface SignedUrlOptions {
    /** 过期时间 (秒) */
    expiresIn: number
    /** HTTP 方法 */
    method?: 'GET' | 'PUT'
    /** Content-Type (PUT 时) */
    contentType?: string
}

// =============================================================================
// 驱动配置类型
// =============================================================================

/**
 * 本地存储配置
 */
export interface LocalStorageOptions {
    /** 根目录 */
    root: string
    /** 创建目录权限 */
    directoryMode?: number
    /** 创建文件权限 */
    fileMode?: number
}

/**
 * 内存存储配置
 */
export interface MemoryStorageOptions {
    /** 最大大小 (bytes) */
    maxSize?: number
}

/**
 * S3 存储配置
 */
export interface S3StorageOptions {
    /** 存储桶名称 */
    bucket: string
    /** 区域 */
    region: string
    /** 端点 (可选，用于 MinIO 等) */
    endpoint?: string
    /** Access Key ID */
    accessKeyId: string
    /** Secret Access Key */
    secretAccessKey: string
    /** 路径前缀 */
    prefix?: string
    /** 强制路径风格 */
    forcePathStyle?: boolean
}

/**
 * 存储配置（传统格式，向后兼容）
 */
export interface StorageConfig {
    /** 存储驱动类型 */
    driver: 'local' | 'memory' | 's3'
    /** 驱动配置 */
    options: LocalStorageOptions | MemoryStorageOptions | S3StorageOptions
    /** 默认加密配置 */
    defaultEncryption?: EncryptionOptions
}

// =============================================================================
// 驱动接口
// =============================================================================

/**
 * 存储驱动接口
 */
export interface StorageDriver {
    /** 驱动名称 */
    readonly name: string

    /** 检查文件是否存在 */
    exists(path: string): Promise<Result<boolean, StorageError>>

    /** 获取文件元数据 */
    getMetadata(path: string): Promise<Result<FileMetadata, StorageError>>

    /** 读取文件 */
    read(path: string, options?: DownloadOptions): Promise<Result<Uint8Array, StorageError>>

    /** 读取文件为文本 */
    readText(path: string, encoding?: BufferEncoding): Promise<Result<string, StorageError>>

    /** 读取文件为 JSON */
    readJson<T = unknown>(path: string): Promise<Result<T, StorageError>>

    /** 写入文件 */
    write(path: string, data: Uint8Array | string, options?: UploadOptions): Promise<Result<FileMetadata, StorageError>>

    /** 写入 JSON 文件 */
    writeJson(path: string, data: unknown, options?: UploadOptions): Promise<Result<FileMetadata, StorageError>>

    /** 追加内容 */
    append(path: string, data: Uint8Array | string): Promise<Result<void, StorageError>>

    /** 删除文件 */
    delete(path: string): Promise<Result<void, StorageError>>

    /** 复制文件 */
    copy(source: string, destination: string, options?: CopyOptions): Promise<Result<FileMetadata, StorageError>>

    /** 移动文件 */
    move(source: string, destination: string, options?: MoveOptions): Promise<Result<FileMetadata, StorageError>>

    /** 列出目录内容 */
    list(path: string, options?: ListOptions): Promise<Result<ListResult, StorageError>>

    /** 创建目录 */
    createDirectory(path: string): Promise<Result<void, StorageError>>

    /** 删除目录 */
    deleteDirectory(path: string, recursive?: boolean): Promise<Result<void, StorageError>>

    /** 生成签名 URL */
    getSignedUrl?(path: string, options: SignedUrlOptions): Promise<Result<string, StorageError>>
}

// =============================================================================
// Provider 接口
// =============================================================================

/**
 * 文件操作 Provider
 */
export interface FileProvider {
    /** 检查文件是否存在 */
    exists(path: string): Promise<Result<boolean, StorageError>>
    /** 获取文件元数据 */
    getMetadata(path: string): Promise<Result<FileMetadata, StorageError>>
    /** 读取文件 */
    read(path: string, options?: DownloadOptions): Promise<Result<Uint8Array, StorageError>>
    /** 读取文件为文本 */
    readText(path: string, encoding?: BufferEncoding): Promise<Result<string, StorageError>>
    /** 读取文件为 JSON */
    readJson<T = unknown>(path: string): Promise<Result<T, StorageError>>
    /** 写入文件 */
    write(path: string, data: Uint8Array | string, options?: UploadOptions): Promise<Result<FileMetadata, StorageError>>
    /** 写入 JSON 文件 */
    writeJson(path: string, data: unknown, options?: UploadOptions): Promise<Result<FileMetadata, StorageError>>
    /** 追加内容 */
    append(path: string, data: Uint8Array | string): Promise<Result<void, StorageError>>
    /** 删除文件 */
    delete(path: string): Promise<Result<void, StorageError>>
    /** 复制文件 */
    copy(source: string, destination: string, options?: CopyOptions): Promise<Result<FileMetadata, StorageError>>
    /** 移动文件 */
    move(source: string, destination: string, options?: MoveOptions): Promise<Result<FileMetadata, StorageError>>
}

/**
 * 目录操作 Provider
 */
export interface DirectoryProvider {
    /** 列出目录内容 */
    list(path: string, options?: ListOptions): Promise<Result<ListResult, StorageError>>
    /** 创建目录 */
    create(path: string): Promise<Result<void, StorageError>>
    /** 删除目录 */
    delete(path: string, recursive?: boolean): Promise<Result<void, StorageError>>
}

/**
 * URL Provider
 */
export interface UrlProvider {
    /** 生成签名 URL */
    getSignedUrl(path: string, options: SignedUrlOptions): Promise<Result<string, StorageError>>
    /** 获取公共 URL */
    getPublicUrl?(path: string): string
}

// =============================================================================
// 统一存储服务接口
// =============================================================================

/**
 * 统一存储服务
 */
export interface StorageService {
    /** 文件操作 */
    readonly file: FileProvider
    /** 目录操作 */
    readonly dir: DirectoryProvider
    /** URL 操作 */
    readonly url: UrlProvider
    /** 底层驱动 */
    readonly driver: StorageDriver
    /** 当前配置 */
    readonly config: StorageServiceConfig
    /** 初始化 */
    init(config?: Partial<StorageServiceConfig>): Promise<void>
}
