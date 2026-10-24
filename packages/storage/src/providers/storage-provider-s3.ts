/**
 * @h-ai/storage — S3 Provider 实现
 *
 * 基于 AWS SDK v3 实现的 S3 协议存储 Provider。
 * 支持 AWS S3、MinIO、RustFS、阿里云 OSS 等兼容 S3 协议的存储服务。
 * @module storage-provider-s3
 */

import type { BucketLocationConstraint, S3ClientConfig } from '@aws-sdk/client-s3'
import type { HaiError, HaiResult } from '@h-ai/core'
import type { S3Config, StorageConfig } from '../storage-config.js'
import type { DirOperations, FileMetadata, FileOperations, ListResult, PresignOperations, StorageDeleteFailure, StorageDeleteResult, StorageDeleteSummary } from '../storage-types.js'
import type { StorageProvider } from './storage-provider-types.js'
import { Buffer } from 'node:buffer'
import { Readable } from 'node:stream'
import {
  CopyObjectCommand,
  CreateBucketCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

import { core, err, ok } from '@h-ai/core'

import { PresignOptionsSchema, PresignUploadOptionsSchema } from '../storage-config.js'
import { toStorageDeleteResult } from '../storage-delete.js'
import { storageM } from '../storage-i18n.js'
import { toByteStream } from '../storage-stream.js'
import {

  HaiStorageError,

} from '../storage-types.js'
import { logStorageOperation } from './storage-operation-log.js'

const logger = core.logger.child({ module: 'storage', scope: 'provider-s3' })
const TRAILING_SLASHES_REGEX = /\/+$/
const LEADING_SLASHES_REGEX = /^\/+/
/** S3 单次 DeleteObjects 最多接受 1000 项；不并发放大删除请求。 */
const DELETE_BATCH_SIZE = 1000
/** 只重试服务明确报告的瞬时逐项错误，最多三次，不重发已成功或权限失败项。 */
const RETRYABLE_DELETE_CODES = new Set(['InternalError', 'ServiceUnavailable', 'SlowDown', 'RequestTimeout'])

// ─── 辅助函数 ───

/**
 * 将 S3 SDK 错误转换为 StorageError
 *
 * 映射规则：
 * - NoSuchKey / NotFound / 404 → NOT_FOUND
 * - AccessDenied → PERMISSION_DENIED
 * - NoSuchBucket → CONFIG_ERROR
 * - NetworkError / ECONNREFUSED → NETWORK_ERROR
 * - 其他 → OPERATION_FAILED
 *
 * @param error - AWS SDK 抛出的原始错误
 * @param key - 相关文件键（可选，用于错误消息）
 * @returns 统一的 StorageError
 */
function toStorageError(error: unknown, key?: string): HaiError {
  const e = error as { name?: string, message?: string, Code?: string }

  if (e.name === 'PreconditionFailed' || (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 412)
    return { ...HaiStorageError.ALREADY_EXISTS, message: storageM('storage_fileAlreadyExists', { params: { key: key ?? '' } }), cause: error }

  // S3 特定错误处理
  if (e.name === 'NoSuchKey' || e.Code === 'NoSuchKey'
    || e.name === 'NotFound' || e.Code === 'NotFound'
    || e.name === '404' || (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) {
    return {
      ...HaiStorageError.NOT_FOUND,
      message: storageM('storage_fileNotFound', { params: { key: key ?? '' } }),
      cause: error,
    }
  }

  if (e.name === 'AccessDenied' || e.Code === 'AccessDenied') {
    return {
      ...HaiStorageError.PERMISSION_DENIED,
      message: storageM('storage_permissionDenied', { params: { key: key ?? '' } }),
      cause: error,
    }
  }

  if (e.name === 'NoSuchBucket' || e.Code === 'NoSuchBucket') {
    return {
      ...HaiStorageError.CONFIG_ERROR,
      message: storageM('storage_bucketNotExist'),
      cause: error,
    }
  }

  // 网络相关错误
  if (e.name === 'NetworkError' || e.name?.includes('ECONNREFUSED')) {
    return {
      ...HaiStorageError.NETWORK_ERROR,
      message: storageM('storage_networkError'),
      cause: error,
    }
  }

  return {
    ...HaiStorageError.OPERATION_FAILED,
    message: storageM('storage_operationFailed', { params: { error: e.message ?? '' } }),
    cause: error,
  }
}

/**
 * 为 key 添加配置中的路径前缀
 *
 * @param key - 用户提供的文件键
 * @param prefix - 配置中的前缀（可能为空）
 * @returns 拼接后的完整 S3 key
 */
function withPrefix(key: string, prefix: string): string {
  if (!prefix)
    return key
  return `${prefix.replace(TRAILING_SLASHES_REGEX, '')}/${key.replace(LEADING_SLASHES_REGEX, '')}`
}

/**
 * 从 S3 key 中移除配置前缀，还原为用户视角的文件键
 *
 * @param key - 包含前缀的完整 S3 key
 * @param prefix - 配置中的前缀
 * @returns 去除前缀后的文件键
 */
function withoutPrefix(key: string, prefix: string): string {
  if (!prefix)
    return key
  const normalizedPrefix = `${prefix.replace(TRAILING_SLASHES_REGEX, '')}/`
  if (key.startsWith(normalizedPrefix)) {
    return key.slice(normalizedPrefix.length)
  }
  return key
}

// ─── S3 Provider 实现 ───

/**
 * 创建 S3 存储 Provider
 *
 * 基于 AWS SDK v3 实现的 StorageProvider。
 * connect 时创建 S3Client，按 createBucket 可选检查/创建桶，再通过 ListObjectsV2 验证连接。
 * 支持配置 prefix 重定向所有 key，对用户透明。
 *
 * 实现说明：
 * - copy 时若指定了 contentType 或 metadata，使用 MetadataDirective='REPLACE'
 * - dir.delete 通过先 list 再批量删除实现
 * - presign 使用 @aws-sdk/s3-request-presigner 签名
 *
 * @returns S3 Provider 实例
 * @example 模块内部上下文
 * ```ts
 * const provider = createS3Provider()
 * await provider.close() // 客户端由 connect 分配；close 释放本地 SDK 资源。
 * ```
 */
export function createS3Provider(): StorageProvider {
  let client: S3Client | null = null
  let deleteClient: S3Client | null = null
  let config: S3Config | null = null
  let ready = false
  let closing: Promise<void> | null = null

  /** 两个客户端独立释放；失败的客户端保留供重试，成功的客户端不重复释放。 */
  function closeClients(): Promise<void> {
    ready = false
    config = null
    if (closing)
      return closing
    closing = Promise.resolve().then(() => {
      const failures: unknown[] = []
      for (const kind of ['normal', 'delete'] as const) {
        const owned = kind === 'normal' ? client : deleteClient
        if (!owned)
          continue
        try {
          owned.destroy()
          if (kind === 'normal')
            client = null
          else deleteClient = null
        }
        catch (error) {
          failures.push(error)
        }
      }
      if (failures.length > 0)
        throw new AggregateError(failures, 'S3 client cleanup failed')
    }).finally(() => { closing = null })
    return closing
  }

  // -------------------------------------------------------------------------
  // 内部辅助
  // -------------------------------------------------------------------------

  /** 获取当前 S3Client；批量删除使用禁用 SDK 请求重试的独立客户端。 */
  function getClient(operation?: 'deleteMany'): S3Client {
    const selected = operation === 'deleteMany' ? deleteClient : client
    if (!ready || !selected) {
      throw new Error(storageM('storage_s3ClientNotInitialized'))
    }
    return selected
  }

  /** 获取当前 S3 配置，未初始化时抛异常 */
  function getConfig(): S3Config {
    if (!ready || !config) {
      throw new Error(storageM('storage_s3ConfigNotInitialized'))
    }
    return config
  }

  /** 将用户 key 拼接配置前缀，得到完整 S3 对象键 */
  function fullKey(key: string): string {
    return withPrefix(key, getConfig().prefix)
  }

  function logOperation(category: 'read' | 'write', operation: string, payload: unknown): void {
    logStorageOperation(logger, config?.operationLog, category, operation, payload)
  }

  // -------------------------------------------------------------------------
  // 文件操作实现
  // -------------------------------------------------------------------------

  const file: FileOperations = {
    async put(key, data, options = {}): Promise<HaiResult<FileMetadata>> {
      try {
        const s3Client = getClient()
        const s3Config = getConfig()
        const fullPath = fullKey(key)

        options.signal?.throwIfAborted()
        const body = typeof data === 'string' ? Buffer.from(data) : data
        const buffered = body instanceof Uint8Array
        let size = buffered ? body.byteLength : 0
        const params = {
          Bucket: s3Config.bucket,
          Key: fullPath,
          ContentType: options.contentType,
          Metadata: options.metadata,
          CacheControl: options.cacheControl,
          ContentDisposition: options.contentDisposition,
          IfNoneMatch: options.ifNoneMatch,
        }
        logOperation('write', 'file.put', { key, fullPath, byteLength: buffered ? size : undefined, options })
        if (buffered) {
          await s3Client.send(new PutObjectCommand({ ...params, Body: body }), { abortSignal: options.signal })
        }
        else {
          async function* counted(): AsyncIterable<Uint8Array> {
            for await (const chunk of toByteStream(data, options.signal)) {
              size += chunk.byteLength
              yield chunk
            }
          }
          const stream = Readable.from(counted(), { objectMode: false })
          const controller = new AbortController()
          const abort = () => controller.abort()
          options.signal?.addEventListener('abort', abort, { once: true })
          try {
            if (options.signal?.aborted)
              abort()
            // 标准 S3 multipart；SDK 管理分片与失败清理，最多缓冲两片。
            const { Upload } = await import('@aws-sdk/lib-storage')
            await new Upload({ client: s3Client, params: { ...params, Body: stream }, queueSize: 2, leavePartsOnError: false, abortController: controller }).done()
          }
          finally {
            options.signal?.removeEventListener('abort', abort)
            stream.destroy()
          }
        }

        // 获取上传后的元数据
        const headResult = await file.head(key)
        if (headResult.success) {
          return headResult
        }

        // 如果获取元数据失败，返回基本信息
        return ok({
          key,
          size,
          contentType: options.contentType || 'application/octet-stream',
          lastModified: new Date(),
        })
      }
      catch (error) {
        return err(toStorageError(error, key))
      }
    },

    async get(key, options = {}): Promise<HaiResult<Buffer>> {
      const streamed = await file.getStream(key, options)
      if (!streamed.success)
        return streamed
      try {
        const chunks: Uint8Array[] = []
        for await (const chunk of streamed.data)
          chunks.push(chunk)
        return ok(Buffer.concat(chunks))
      }
      catch (error) {
        return err(toStorageError(error, key))
      }
    },

    async getStream(key, options = {}) {
      try {
        const s3Client = getClient()
        const s3Config = getConfig()
        const fullPath = fullKey(key)
        logOperation('read', 'file.getStream', { key, fullPath, options })

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
        }), { abortSignal: options.signal })

        if (!response.Body) {
          return err(
            HaiStorageError.OPERATION_FAILED,
            storageM('storage_responseBodyEmpty'),
          )
        }

        // Node SDK 的 Body 是字节可迭代流；SDK 类型联合也包含其他运行时的 Blob。
        const stream = response.Body as AsyncIterable<Uint8Array>
        return ok(stream)
      }
      catch (error) {
        return err(toStorageError(error, key))
      }
    },

    async head(key): Promise<HaiResult<FileMetadata>> {
      try {
        const s3Client = getClient()
        const s3Config = getConfig()
        const fullPath = fullKey(key)
        logOperation('read', 'file.head', { key, fullPath })

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

    async exists(key): Promise<HaiResult<boolean>> {
      logOperation('read', 'file.exists', { key })
      const result = await file.head(key)
      if (result.success) {
        return ok(true)
      }
      if (result.error.code === HaiStorageError.NOT_FOUND.code) {
        return ok(false)
      }
      return err(result.error)
    },

    async delete(key): Promise<HaiResult<void>> {
      try {
        const s3Client = getClient()
        const s3Config = getConfig()
        const fullPath = fullKey(key)
        logOperation('write', 'file.delete', { key, fullPath })

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

    async deleteMany(keys): Promise<StorageDeleteResult> {
      try {
        const s3Client = getClient('deleteMany')
        const s3Config = getConfig()
        logOperation('write', 'file.deleteMany', { count: keys.length, keys })
        const uniqueKeys = [...new Set(keys)]
        const summary: StorageDeleteSummary = { deletedKeys: [], failures: [] }
        for (let offset = 0; offset < uniqueKeys.length; offset += DELETE_BATCH_SIZE) {
          let pending = uniqueKeys.slice(offset, offset + DELETE_BATCH_SIZE)
          for (let attempt = 0; pending.length > 0 && attempt < 3; attempt++) {
            let response
            try {
              response = await s3Client.send(new DeleteObjectsCommand({
                Bucket: s3Config.bucket,
                Delete: { Objects: [...new Set(pending.map(fullKey))].map(Key => ({ Key })), Quiet: false },
              }))
            }
            catch (cause) {
              // 已发送请求的结果可能未知，尚未发送的后续批次不能被标记为已删除。
              const failure = (cause && typeof cause === 'object' ? cause : {}) as { name?: string, $metadata?: { httpStatusCode?: number } }
              const status = failure.$metadata?.httpStatusCode
              const code = failure.name && /^[\w.-]{1,80}$/.test(failure.name) ? failure.name : 'RequestFailed'
              const retryable = status === undefined || status === 408 || status === 429 || status >= 500
              const outcome: StorageDeleteFailure['outcome'] = status !== undefined && status >= 400 && status < 500 && status !== 408 ? 'failed' : 'unknown'
              summary.failures.push(...pending.map(key => ({ key, code, retryable, outcome })))
              summary.failures.push(...uniqueKeys.slice(offset + DELETE_BATCH_SIZE).map(key => ({ key, code, retryable, outcome: 'notAttempted' as const })))
              return toStorageDeleteResult(summary)
            }
            const outcomes = new Map<string, string | null>()
            const requested = new Set(pending.map(fullKey))
            let malformed = false
            // 非 quiet 响应中每个请求键必须恰好出现一次；遗漏、重复和越界都不能宣称成功。
            const items = [
              ...(response.Deleted ?? []).map(item => ({ key: item.Key, code: null })),
              ...(response.Errors ?? []).map(item => ({ key: item.Key, code: item.Code && /^[\w.-]{1,80}$/.test(item.Code) ? item.Code : 'UnknownError' })),
            ]
            for (const item of items) {
              if (!item.key || !requested.has(item.key) || outcomes.has(item.key)) {
                malformed = true
                break
              }
              outcomes.set(item.key, item.code)
            }
            if (malformed || outcomes.size !== requested.size) {
              summary.failures.push(...pending.map(key => ({ key, code: 'InvalidDeleteResponse', retryable: false, outcome: 'unknown' as const })))
              summary.failures.push(...uniqueKeys.slice(offset + DELETE_BATCH_SIZE).map(key => ({ key, code: 'InvalidDeleteResponse', retryable: false, outcome: 'notAttempted' as const })))
              return toStorageDeleteResult(summary)
            }
            const retry: string[] = []
            for (const key of pending) {
              const code = outcomes.get(fullKey(key))
              if (code === null)
                summary.deletedKeys.push(key)
              else if (code && RETRYABLE_DELETE_CODES.has(code) && attempt < 2)
                retry.push(key)
              else
                summary.failures.push({ key, code: code ?? 'UnknownError', retryable: !!code && RETRYABLE_DELETE_CODES.has(code), outcome: 'failed' })
            }
            pending = retry
            if (pending.length > 0)
              await new Promise(resolve => setTimeout(resolve, 100 * 2 ** attempt))
          }
        }
        return toStorageDeleteResult(summary)
      }
      catch (error) {
        return err(toStorageError(error))
      }
    },

    async copy(sourceKey, destKey, options = {}): Promise<HaiResult<FileMetadata>> {
      try {
        const s3Client = getClient()
        const s3Config = getConfig()
        const sourceFullPath = fullKey(sourceKey)
        const destFullPath = fullKey(destKey)
        logOperation('write', 'file.copy', { sourceKey, destKey, sourceFullPath, destFullPath, options })

        await s3Client.send(new CopyObjectCommand({
          Bucket: s3Config.bucket,
          CopySource: `${s3Config.bucket}/${sourceFullPath}`,
          Key: destFullPath,
          ContentType: options.contentType,
          Metadata: options.metadata,
          MetadataDirective: (options.metadata || options.contentType) ? 'REPLACE' : 'COPY',
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
    async list(options = {}): Promise<HaiResult<ListResult>> {
      try {
        const s3Client = getClient()
        const s3Config = getConfig()
        logOperation('read', 'dir.list', { options })

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

    async delete(prefix): Promise<HaiResult<void>> {
      try {
        logOperation('write', 'dir.delete', { prefix })
        // 分页列出并逐批删除，每批最多 1000 个对象
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

          const keys = listResult.data.files.map(f => f.key)
          if (keys.length > 0) {
            const deleteResult = await file.deleteMany(keys)
            if (!deleteResult.success) {
              return deleteResult
            }
          }

          continuationToken = listResult.data.nextContinuationToken
        } while (continuationToken)

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
    async getUrl(key, options?): Promise<HaiResult<string>> {
      try {
        const parsed = PresignOptionsSchema.parse(options ?? {})
        const s3Client = getClient()
        const s3Config = getConfig()
        const fullPath = fullKey(key)
        logOperation('read', 'presign.getUrl', { key, fullPath, options })

        const command = new GetObjectCommand({
          Bucket: s3Config.bucket,
          Key: fullPath,
          ResponseContentType: parsed.responseContentType,
          ResponseContentDisposition: parsed.responseContentDisposition,
        })

        const url = await getSignedUrl(s3Client, command, {
          expiresIn: parsed.expiresIn,
        })

        return ok(url)
      }
      catch (error) {
        return err(
          HaiStorageError.PRESIGN_FAILED,
          storageM('storage_presignUrlFailed'),
          error,
        )
      }
    },

    async putUrl(key, options?): Promise<HaiResult<string>> {
      try {
        const parsed = PresignUploadOptionsSchema.parse(options ?? {})
        const s3Client = getClient()
        const s3Config = getConfig()
        const fullPath = fullKey(key)
        logOperation('write', 'presign.putUrl', { key, fullPath, options })

        const command = new PutObjectCommand({
          Bucket: s3Config.bucket,
          Key: fullPath,
          ContentType: parsed.contentType,
        })

        const url = await getSignedUrl(s3Client, command, {
          expiresIn: parsed.expiresIn,
        })

        return ok(url)
      }
      catch (error) {
        return err(
          HaiStorageError.PRESIGN_FAILED,
          storageM('storage_presignUploadUrlFailed'),
          error,
        )
      }
    },

    publicUrl(key): string | null {
      const s3Config = getConfig()
      if (!s3Config.publicUrl) {
        return null
      }
      const fullPath = fullKey(key)
      logOperation('read', 'presign.publicUrl', { key, fullPath })
      return `${s3Config.publicUrl.replace(TRAILING_SLASHES_REGEX, '')}/${fullPath}`
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

    async connect(cfg: StorageConfig): Promise<HaiResult<void>> {
      if (cfg.type !== 's3') {
        return err(
          HaiStorageError.CONFIG_ERROR,
          storageM('storage_s3ConfigTypeError'),
        )
      }

      try {
        await closeClients()

        config = cfg
        logger.info('Connecting S3 provider', {
          bucket: cfg.bucket,
          region: cfg.region,
          endpoint: cfg.endpoint ? core.sanitize.sanitizeUrl(cfg.endpoint) : undefined,
        })

        const clientConfig: S3ClientConfig = {
          region: cfg.region,
          endpoint: cfg.endpoint,
          forcePathStyle: cfg.forcePathStyle,
          // 不强制兼容服务实现 AWS checksum 扩展；校验工具按实际字节独立计算。
          requestChecksumCalculation: 'WHEN_REQUIRED',
          responseChecksumValidation: 'WHEN_REQUIRED',
          credentials: {
            accessKeyId: cfg.accessKeyId,
            secretAccessKey: cfg.secretAccessKey,
          },
        }
        client = new S3Client(clientConfig)
        // 回执丢失时重放可能删除并发新版本；只允许上层对明确的逐项瞬时错误重试。
        deleteClient = new S3Client({ ...clientConfig, maxAttempts: 1 })

        if (cfg.createBucket) {
          try {
            await client.send(new HeadBucketCommand({ Bucket: cfg.bucket }))
          }
          catch (error) {
            // HeadBucket 只有明确 404 才证明缺失；403、网络错误与服务异常必须阻止启动。
            if (!(error && typeof error === 'object' && '$metadata' in error
              && error.$metadata && typeof error.$metadata === 'object'
              && 'httpStatusCode' in error.$metadata && error.$metadata.httpStatusCode === 404)) {
              throw error
            }
            try {
              await client.send(new CreateBucketCommand({
                Bucket: cfg.bucket,
                // AWS us-east-1 要省略 LocationConstraint；兼容服务可使用自定义区域名。
                ...(cfg.region === 'us-east-1' ? {} : { CreateBucketConfiguration: { LocationConstraint: cfg.region as BucketLocationConstraint } }),
              }))
              logger.info('S3 bucket created', { bucket: cfg.bucket })
            }
            catch (createError) {
              // 并发应用仅接受本账号已拥有的桶，并重新核验访问；全局名称冲突不能当成功。
              if (!(createError instanceof Error && createError.name === 'BucketAlreadyOwnedByYou'))
                throw createError
              await client.send(new HeadBucketCommand({ Bucket: cfg.bucket }))
            }
          }
        }

        // 测试连接：尝试列出一个对象
        await client.send(new ListObjectsV2Command({
          Bucket: cfg.bucket,
          MaxKeys: 1,
        }))

        config = cfg
        ready = true
        logger.info('S3 provider connected', { bucket: cfg.bucket })
        return ok(undefined)
      }
      catch (error) {
        logger.error('S3 provider connect failed', { error })
        const original = toStorageError(error)
        try {
          await closeClients()
          return err(original)
        }
        catch (cleanupError) {
          return err({ ...original, ext: { ...original.ext, cleanupPending: true, cleanupError } })
        }
      }
    },

    close: closeClients,

    isConnected(): boolean {
      return ready && client !== null && deleteClient !== null && config !== null
    },
  }
}
