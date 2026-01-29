/**
 * =============================================================================
 * @hai/storage - S3 Provider 实现
 * =============================================================================
 *
 * 基于 AWS SDK v3 实现的 S3 协议存储 Provider。
 * 支持 AWS S3、MinIO、阿里云 OSS 等兼容 S3 协议的存储服务。
 *
 * @example
 * ```ts
 * import { createS3Provider } from '@hai/storage'
 *
 * const provider = createS3Provider()
 * await provider.connect({
 *     type: 's3',
 *     bucket: 'my-bucket',
 *     region: 'us-east-1',
 *     accessKeyId: 'xxx',
 *     secretAccessKey: 'xxx'
 * })
 *
 * // 上传文件
 * await provider.file.put('test.txt', 'Hello World')
 *
 * // 生成签名 URL
 * const url = await provider.presign.getUrl('test.txt', { expiresIn: 3600 })
 * ```
 *
 * @module storage-provider-s3
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type {
  DirOperations,
  FileMetadata,
  FileOperations,
  ListResult,
  PresignOperations,
  S3Config,
  StorageConfig,
  StorageError,
  StorageProvider,
} from '../storage-types.js'
import { Buffer } from 'node:buffer'
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

import { err, ok } from '@hai/core'

import { StorageErrorCode } from '../storage-config.js'

// =============================================================================
// 辅助函数
// =============================================================================

/**
 * 将 S3 错误转换为 StorageError
 */
function toStorageError(error: unknown, key?: string): StorageError {
  const e = error as { name?: string, message?: string, Code?: string }

  // S3 特定错误处理
  if (e.name === 'NoSuchKey' || e.Code === 'NoSuchKey') {
    return {
      code: StorageErrorCode.NOT_FOUND,
      message: `文件不存在: ${key}`,
      key,
      cause: error,
    }
  }

  if (e.name === 'AccessDenied' || e.Code === 'AccessDenied') {
    return {
      code: StorageErrorCode.PERMISSION_DENIED,
      message: `权限不足: ${key}`,
      key,
      cause: error,
    }
  }

  if (e.name === 'NoSuchBucket' || e.Code === 'NoSuchBucket') {
    return {
      code: StorageErrorCode.CONFIG_ERROR,
      message: '存储桶不存在',
      cause: error,
    }
  }

  // 网络相关错误
  if (e.name === 'NetworkError' || e.name?.includes('ECONNREFUSED')) {
    return {
      code: StorageErrorCode.NETWORK_ERROR,
      message: '网络错误',
      cause: error,
    }
  }

  return {
    code: StorageErrorCode.OPERATION_FAILED,
    message: e.message ? `操作失败: ${e.message}` : '操作失败',
    key,
    cause: error,
  }
}

/**
 * 添加前缀到 key
 */
function withPrefix(key: string, prefix: string): string {
  if (!prefix)
    return key
  return `${prefix.replace(/\/+$/, '')}/${key.replace(/^\/+/, '')}`
}

/**
 * 从 key 移除前缀
 */
function withoutPrefix(key: string, prefix: string): string {
  if (!prefix)
    return key
  const normalizedPrefix = `${prefix.replace(/\/+$/, '')}/`
  if (key.startsWith(normalizedPrefix)) {
    return key.slice(normalizedPrefix.length)
  }
  return key
}

// =============================================================================
// S3 Provider 实现
// =============================================================================

/**
 * 创建 S3 存储 Provider
 *
 * @returns S3 Provider 实例
 */
export function createS3Provider(): StorageProvider {
  let client: S3Client | null = null
  let config: S3Config | null = null

  // -------------------------------------------------------------------------
  // 内部辅助
  // -------------------------------------------------------------------------

  function getClient(): S3Client {
    if (!client) {
      throw new Error('S3 client not initialized')
    }
    return client
  }

  function getConfig(): S3Config {
    if (!config) {
      throw new Error('S3 config not initialized')
    }
    return config
  }

  function fullKey(key: string): string {
    return withPrefix(key, getConfig().prefix)
  }

  // -------------------------------------------------------------------------
  // 文件操作实现
  // -------------------------------------------------------------------------

  const file: FileOperations = {
    async put(key, data, options = {}): Promise<Result<FileMetadata, StorageError>> {
      try {
        const s3Client = getClient()
        const s3Config = getConfig()
        const fullPath = fullKey(key)

        const body = typeof data === 'string' ? Buffer.from(data) : data

        await s3Client.send(new PutObjectCommand({
          Bucket: s3Config.bucket,
          Key: fullPath,
          Body: body,
          ContentType: options.contentType,
          Metadata: options.metadata,
          CacheControl: options.cacheControl,
          ContentDisposition: options.contentDisposition,
        }))

        // 获取上传后的元数据
        const headResult = await file.head(key)
        if (headResult.success) {
          return headResult
        }

        // 如果获取元数据失败，返回基本信息
        return ok({
          key,
          size: body.length,
          contentType: options.contentType || 'application/octet-stream',
          lastModified: new Date(),
        })
      }
      catch (error) {
        return err(toStorageError(error, key))
      }
    },

    async get(key, options = {}): Promise<Result<Buffer, StorageError>> {
      try {
        const s3Client = getClient()
        const s3Config = getConfig()
        const fullPath = fullKey(key)

        let Range: string | undefined
        if (options.rangeStart !== undefined || options.rangeEnd !== undefined) {
          const start = options.rangeStart ?? 0
          const end = options.rangeEnd !== undefined ? options.rangeEnd : ''
          Range = `bytes=${start}-${end}`
        }

        const response = await s3Client.send(new GetObjectCommand({
          Bucket: s3Config.bucket,
          Key: fullPath,
          Range,
        }))

        if (!response.Body) {
          return err({
            code: StorageErrorCode.OPERATION_FAILED,
            message: '响应体为空',
            key,
          })
        }

        // 将流转换为 Buffer
        const chunks: Uint8Array[] = []
        const stream = response.Body as AsyncIterable<Uint8Array>
        for await (const chunk of stream) {
          chunks.push(chunk)
        }

        return ok(Buffer.concat(chunks))
      }
      catch (error) {
        return err(toStorageError(error, key))
      }
    },

    async head(key): Promise<Result<FileMetadata, StorageError>> {
      try {
        const s3Client = getClient()
        const s3Config = getConfig()
        const fullPath = fullKey(key)

        const response = await s3Client.send(new HeadObjectCommand({
          Bucket: s3Config.bucket,
          Key: fullPath,
        }))

        return ok({
          key,
          size: response.ContentLength || 0,
          contentType: response.ContentType || 'application/octet-stream',
          lastModified: response.LastModified || new Date(),
          etag: response.ETag,
          metadata: response.Metadata,
        })
      }
      catch (error) {
        return err(toStorageError(error, key))
      }
    },

    async exists(key): Promise<Result<boolean, StorageError>> {
      const result = await file.head(key)
      if (result.success) {
        return ok(true)
      }
      if (result.error.code === StorageErrorCode.NOT_FOUND) {
        return ok(false)
      }
      return err(result.error)
    },

    async delete(key): Promise<Result<void, StorageError>> {
      try {
        const s3Client = getClient()
        const s3Config = getConfig()
        const fullPath = fullKey(key)

        await s3Client.send(new DeleteObjectCommand({
          Bucket: s3Config.bucket,
          Key: fullPath,
        }))

        return ok(undefined)
      }
      catch (error) {
        return err(toStorageError(error, key))
      }
    },

    async deleteMany(keys): Promise<Result<void, StorageError>> {
      try {
        const s3Client = getClient()
        const s3Config = getConfig()

        if (keys.length === 0) {
          return ok(undefined)
        }

        await s3Client.send(new DeleteObjectsCommand({
          Bucket: s3Config.bucket,
          Delete: {
            Objects: keys.map(key => ({ Key: fullKey(key) })),
          },
        }))

        return ok(undefined)
      }
      catch (error) {
        return err(toStorageError(error))
      }
    },

    async copy(sourceKey, destKey, options = {}): Promise<Result<FileMetadata, StorageError>> {
      try {
        const s3Client = getClient()
        const s3Config = getConfig()
        const sourceFullPath = fullKey(sourceKey)
        const destFullPath = fullKey(destKey)

        await s3Client.send(new CopyObjectCommand({
          Bucket: s3Config.bucket,
          CopySource: `${s3Config.bucket}/${sourceFullPath}`,
          Key: destFullPath,
          ContentType: options.contentType,
          Metadata: options.metadata,
          MetadataDirective: options.metadata ? 'REPLACE' : 'COPY',
        }))

        return file.head(destKey)
      }
      catch (error) {
        return err(toStorageError(error, sourceKey))
      }
    },
  }

  // -------------------------------------------------------------------------
  // 目录操作实现
  // -------------------------------------------------------------------------

  const dir: DirOperations = {
    async list(options = {}): Promise<Result<ListResult, StorageError>> {
      try {
        const s3Client = getClient()
        const s3Config = getConfig()

        // 构建完整前缀
        let prefix = s3Config.prefix || ''
        if (options.prefix) {
          prefix = withPrefix(options.prefix, s3Config.prefix)
        }

        const response = await s3Client.send(new ListObjectsV2Command({
          Bucket: s3Config.bucket,
          Prefix: prefix || undefined,
          Delimiter: options.delimiter,
          MaxKeys: options.maxKeys,
          ContinuationToken: options.continuationToken,
        }))

        const files: FileMetadata[] = (response.Contents || []).map(item => ({
          key: withoutPrefix(item.Key || '', s3Config.prefix),
          size: item.Size || 0,
          contentType: 'application/octet-stream', // ListObjects 不返回 ContentType
          lastModified: item.LastModified || new Date(),
          etag: item.ETag,
        }))

        const commonPrefixes = (response.CommonPrefixes || [])
          .map(p => withoutPrefix(p.Prefix || '', s3Config.prefix))
          .filter(p => p.length > 0)

        return ok({
          files,
          commonPrefixes,
          nextContinuationToken: response.NextContinuationToken,
          isTruncated: response.IsTruncated || false,
        })
      }
      catch (error) {
        return err(toStorageError(error))
      }
    },

    async delete(prefix): Promise<Result<void, StorageError>> {
      try {
        // 列出所有文件并批量删除
        const allKeys: string[] = []
        let continuationToken: string | undefined

        do {
          const listResult = await dir.list({
            prefix,
            continuationToken,
            maxKeys: 1000,
          })

          if (!listResult.success) {
            return err(listResult.error)
          }

          allKeys.push(...listResult.data.files.map(f => f.key))
          continuationToken = listResult.data.nextContinuationToken
        } while (continuationToken)

        if (allKeys.length > 0) {
          return file.deleteMany(allKeys)
        }

        return ok(undefined)
      }
      catch (error) {
        return err(toStorageError(error))
      }
    },
  }

  // -------------------------------------------------------------------------
  // 签名 URL 操作实现
  // -------------------------------------------------------------------------

  const presign: PresignOperations = {
    async getUrl(key, options?): Promise<Result<string, StorageError>> {
      try {
        const s3Client = getClient()
        const s3Config = getConfig()
        const fullPath = fullKey(key)

        const command = new GetObjectCommand({
          Bucket: s3Config.bucket,
          Key: fullPath,
          ResponseContentType: options?.responseContentType,
          ResponseContentDisposition: options?.responseContentDisposition,
        })

        const url = await getSignedUrl(s3Client, command, {
          expiresIn: options?.expiresIn || 3600,
        })

        return ok(url)
      }
      catch (error) {
        return err({
          code: StorageErrorCode.PRESIGN_FAILED,
          message: '生成签名 URL 失败',
          key,
          cause: error,
        })
      }
    },

    async putUrl(key, options?): Promise<Result<string, StorageError>> {
      try {
        const s3Client = getClient()
        const s3Config = getConfig()
        const fullPath = fullKey(key)

        const command = new PutObjectCommand({
          Bucket: s3Config.bucket,
          Key: fullPath,
          ContentType: options?.contentType || 'application/octet-stream',
        })

        const url = await getSignedUrl(s3Client, command, {
          expiresIn: options?.expiresIn || 3600,
        })

        return ok(url)
      }
      catch (error) {
        return err({
          code: StorageErrorCode.PRESIGN_FAILED,
          message: '生成上传签名 URL 失败',
          key,
          cause: error,
        })
      }
    },

    publicUrl(key): string | null {
      const s3Config = getConfig()
      if (!s3Config.publicUrl) {
        return null
      }
      const fullPath = fullKey(key)
      return `${s3Config.publicUrl.replace(/\/+$/, '')}/${fullPath}`
    },
  }

  // -------------------------------------------------------------------------
  // Provider 接口实现
  // -------------------------------------------------------------------------

  return {
    name: 's3',

    file,
    dir,
    presign,

    async connect(cfg: StorageConfig): Promise<Result<void, StorageError>> {
      if (cfg.type !== 's3') {
        return err({
          code: StorageErrorCode.CONFIG_ERROR,
          message: '配置类型错误：S3 provider 仅支持 type=s3',
        })
      }

      try {
        config = cfg

        client = new S3Client({
          region: cfg.region,
          endpoint: cfg.endpoint,
          forcePathStyle: cfg.forcePathStyle,
          credentials: {
            accessKeyId: cfg.accessKeyId,
            secretAccessKey: cfg.secretAccessKey,
          },
        })

        // 测试连接：尝试列出一个对象
        await client.send(new ListObjectsV2Command({
          Bucket: cfg.bucket,
          MaxKeys: 1,
        }))

        return ok(undefined)
      }
      catch (error) {
        config = null
        client = null
        return err(toStorageError(error))
      }
    },

    async close(): Promise<void> {
      if (client) {
        client.destroy()
        client = null
        config = null
      }
    },

    isConnected(): boolean {
      return client !== null && config !== null
    },
  }
}
