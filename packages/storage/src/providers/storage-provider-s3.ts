/**
 * @h-ai/storage — S3 Provider 实现
 *
 * 基于 AWS SDK v3 实现的 S3 协议存储 Provider。
 * 支持 AWS S3、MinIO、RustFS、阿里云 OSS 等兼容 S3 协议的存储服务。
 * @module storage-provider-s3
 */

import type { BucketLocationConstraint, HeadObjectCommandOutput, S3ClientConfig } from '@aws-sdk/client-s3'
import type { Upload } from '@aws-sdk/lib-storage'

import type { HaiError, HaiResult } from '@h-ai/core'
import type { S3Config, StorageConfig } from '../storage-config.js'
import type { DirOperations, DownloadOptions, FileMetadata, FileOperations, ListResult, PresignOperations, StorageDeleteFailure, StorageDeleteResult, StorageDeleteSummary, StorageFileRead } from '../storage-types.js'
import type { StorageProvider } from './storage-provider-types.js'
import { AsyncLocalStorage } from 'node:async_hooks'
import { Buffer } from 'node:buffer'
import { Readable } from 'node:stream'
import {
  AbortMultipartUploadCommand,
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
import { core } from '@h-ai/core'

import { PresignOptionsSchema, PresignUploadOptionsSchema } from '../storage-config.js'
import { deleteStoragePrefix, toStorageDeleteResult } from '../storage-delete.js'
import { storageM } from '../storage-i18n.js'
import { createStorageReadStream, toByteStream } from '../storage-stream.js'
import {

  HaiStorageError,

} from '../storage-types.js'

const logger = core.logger.child({ module: 'storage', scope: 'provider-s3' })
const LEADING_SLASHES_REGEX = /^\/+/
/** S3 单次 DeleteObjects 最多接受 1000 项；不并发放大删除请求。 */
const DELETE_BATCH_SIZE = 1000
/** 只重试服务明确报告的瞬时逐项错误，最多三次，不重发已成功或权限失败项。 */
const RETRYABLE_DELETE_CODES = new Set([
  'InternalError',
  'ServiceUnavailable',
  'SlowDown',
  'RequestTimeout',
])

/**
 * 同一次流式上传的停止信号和首个失败；并发上传各自隔离。
 * @example 模块内部上下文
 * ```ts
 * const stop = new AbortController()
 * const diagnostics: UploadDiagnostics = { bucket: 'uploads', key: 'report.zip', signal: stop.signal, stop }
 * uploadDiagnostics.run(diagnostics, () => void uploadDiagnostics.getStore())
 * ```
 */
interface UploadDiagnostics {
  bucket: string
  key: string
  signal: AbortSignal
  stop: AbortController
  failure?: { cause: unknown, operation?: string }
}

const uploadDiagnostics = new AsyncLocalStorage<UploadDiagnostics>()
const UPLOAD_COMMANDS = new Set([
  'PutObject',
  'CreateMultipartUpload',
  'UploadPart',
  'CompleteMultipartUpload',
])

/** 记录首个写入失败，并在上传中止后拒绝发送新的分片或提交请求。 */
function observeUploadRequests(client: S3Client): void {
  client.middlewareStack.add((next, context) => async (args) => {
    const diagnostics = uploadDiagnostics.getStore()
    if (!diagnostics)
      return next(args)
    const operation = context.commandName?.replace(/Command$/, '')
    const input = args.input
    if (!operation || !UPLOAD_COMMANDS.has(operation) || !input || typeof input !== 'object'
      || !('Bucket' in input) || input.Bucket !== diagnostics.bucket
      || !('Key' in input) || input.Key !== diagnostics.key) {
      return next(args)
    }
    diagnostics.signal.throwIfAborted()
    try {
      const response = await next(args)
      // SDK 在请求返回后才检查 ETag；提前归入分片失败，清理报错时仍可定位原始响应。
      if (operation === 'UploadPart' && (!('ETag' in response.output) || !response.output.ETag)) {
        const { httpStatusCode, requestId } = response.output.$metadata
        const partNumber = 'PartNumber' in input && typeof input.PartNumber === 'number'
          ? input.PartNumber
          : undefined
        throw Object.assign(new Error('S3 upload part response is missing ETag'), {
          name: 'MissingETag',
          partNumber,
          $metadata: { httpStatusCode, requestId },
        })
      }
      return response
    }
    catch (cause) {
      diagnostics.failure ??= { cause, operation }
      diagnostics.stop.abort(cause)
      throw cause
    }
  }, { step: 'initialize', name: 'haiStorageObserveUploadRequests' })
}

// ─── 辅助函数 ───

/**
 * 将 S3 SDK 错误转换为 StorageError
 *
 * 映射规则：
 * - NoSuchBucket → CONFIG_ERROR，优先于通用 HTTP 状态码
 * - NoSuchKey / NotFound / 404 → NOT_FOUND
 * - AccessDenied → PERMISSION_DENIED
 * - NetworkError / ECONNREFUSED → NETWORK_ERROR
 * - 其他 → OPERATION_FAILED
 *
 * @param error - AWS SDK 抛出的原始错误
 * @param key - 相关文件键（可选，用于错误消息）
 * @returns 统一的 StorageError
 */
function toStorageError(error: unknown, key?: string): HaiError {
  const e = (error ?? {}) as { name?: string, message?: string, Code?: string, $metadata?: { httpStatusCode?: number } }

  if (e.name === 'PreconditionFailed' || e.$metadata?.httpStatusCode === 412) {
    return {
      ...HaiStorageError.ALREADY_EXISTS,
      message: storageM('storage_fileAlreadyExists', {
        params: { key: key ?? '' },
      }),
      cause: error,
    }
  }

  // S3 特定错误处理
  if (e.name === 'NoSuchBucket' || e.Code === 'NoSuchBucket') {
    return {
      ...HaiStorageError.CONFIG_ERROR,
      message: storageM('storage_bucketNotExist'),
      cause: error,
    }
  }

  if (e.name === 'NoSuchKey' || e.Code === 'NoSuchKey'
    || e.name === 'NotFound' || e.Code === 'NotFound'
    || e.name === '404' || e.$metadata?.httpStatusCode === 404) {
    return {
      ...HaiStorageError.NOT_FOUND,
      message: storageM('storage_fileNotFound', {
        params: { key: key ?? '' },
      }),
      cause: error,
    }
  }

  if (e.name === 'AccessDenied' || e.Code === 'AccessDenied' || e.$metadata?.httpStatusCode === 403) {
    return {
      ...HaiStorageError.PERMISSION_DENIED,
      message: storageM('storage_permissionDenied', {
        params: { key: key ?? '' },
      }),
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
    message: storageM('storage_operationFailed', {
      params: { error: e.message ?? '' },
    }),
    cause: error,
  }
}

/** 线性移除路径末尾的斜杠。 */
function trimTrailingSlashes(value: string): string {
  let end = value.length
  while (end > 0 && value[end - 1] === '/')
    end--
  return value.slice(0, end)
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
  return `${trimTrailingSlashes(prefix)}/${key.replace(LEADING_SLASHES_REGEX, '')}`
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
  const normalizedPrefix = withPrefix('', prefix)
  if (key.startsWith(normalizedPrefix)) {
    return key.slice(normalizedPrefix.length)
  }
  return key
}

/** 按相同字段解释 HeadObject 和 GetObject 响应中的对象元数据。 */
function objectMetadata(key: string, response: Pick<HeadObjectCommandOutput, 'ContentLength' | 'ContentType' | 'LastModified' | 'ETag' | 'Metadata'>): FileMetadata {
  return {
    key,
    size: response.ContentLength ?? 0,
    contentType: response.ContentType || 'application/octet-stream',
    lastModified: response.LastModified ?? new Date(),
    etag: response.ETag,
    metadata: response.Metadata,
  }
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
 * - copy 指定 contentType 或 metadata 时，结合源 ETag 和继承字段使用 MetadataDirective='REPLACE'
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
  let presignClient: S3Client | null = null
  let publicBasePath = ''
  let config: S3Config | null = null
  let ready = false
  let closing: Promise<void> | null = null

  /** 所有自有客户端独立释放；失败的客户端保留供重试，成功的客户端不重复释放。 */
  function closeClients(): Promise<void> {
    ready = false
    config = null
    publicBasePath = ''
    if (closing)
      return closing
    closing = Promise.resolve().then(() => {
      const failures: unknown[] = []
      for (const kind of ['normal', 'delete', 'presign'] as const) {
        const owned = kind === 'normal'
          ? client
          : kind === 'delete'
            ? deleteClient
            : presignClient
        if (!owned)
          continue
        try {
          owned.destroy()
          if (kind === 'normal')
            client = null
          else if (kind === 'delete')
            deleteClient = null
          else presignClient = null
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

  /** 预签名可使用外部端点；删除与其他存储请求使用内部端点，删除禁用 SDK 重试。 */
  function getClient(operation?: 'delete' | 'presign'): S3Client {
    const selected = operation === 'delete'
      ? deleteClient
      : operation === 'presign'
        ? presignClient ?? client
        : client
    if (!ready || !selected) {
      throw new Error(storageM('storage_s3ClientNotInitialized'))
    }
    return selected
  }

  /**
   * 只添加入口代理目录，保留原始签名路径编码与查询；Nginx 转发时去除同一目录。
   * @param url - S3 客户端按公开 origin 生成的签名地址。
   * @param basePath - 已校验且无末尾斜杠的入口目录，空字符串保持地址不变。
   * @returns 添加入口目录后的浏览器地址，不重新编码路径或查询。
   * @example 模块内部上下文
   * ```ts
   * const url = publicPresignedUrl('https://files.example.com/private/report.pdf', '/delivery/files')
   * void url
   * ```
   */
  function publicPresignedUrl(url: string, basePath: string): string {
    if (!basePath)
      return url
    const pathOffset = url.indexOf('/', url.indexOf('://') + 3)
    return `${url.slice(0, pathOffset)}${basePath}${url.slice(pathOffset)}`
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

  /** 用一次 S3 请求打开正文，同时取得相同响应的元数据。 */
  async function openObject(key: string, options: DownloadOptions): Promise<HaiResult<StorageFileRead>> {
    try {
      const s3Client = getClient()
      const s3Config = getConfig()
      const fullPath = fullKey(key)
      const Range = options.rangeStart !== undefined || options.rangeEnd !== undefined
        ? `bytes=${options.rangeStart ?? 0}-${options.rangeEnd ?? ''}`
        : undefined
      const response = await s3Client.send(new GetObjectCommand({
        Bucket: s3Config.bucket,
        Key: fullPath,
        Range,
      }), { abortSignal: options.signal })

      if (!(response.Body instanceof Readable))
        return core.err(HaiStorageError.OPERATION_FAILED, storageM('storage_responseBodyEmpty'))

      return core.ok({
        metadata: objectMetadata(key, response),
        ...createStorageReadStream(response.Body, options.signal),
      })
    }
    catch (error) {
      return core.err(toStorageError(error, key))
    }
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
        const body = typeof data === 'string'
          ? Buffer.from(data)
          : data
        const buffered = body instanceof Uint8Array
        let size = buffered ? body.byteLength : 0
        let etag: string | undefined
        const params = {
          Bucket: s3Config.bucket,
          Key: fullPath,
          ContentType: options.contentType,
          Metadata: options.metadata
            ? { ...options.metadata }
            : undefined,
          CacheControl: options.cacheControl,
          ContentDisposition: options.contentDisposition,
          IfNoneMatch: options.ifNoneMatch,
        }
        if (buffered) {
          const receipt = await s3Client.send(new PutObjectCommand({ ...params, Body: body }), { abortSignal: options.signal })
          etag = receipt.ETag
        }
        else {
          const stop = new AbortController()
          const signal = options.signal
            ? AbortSignal.any([options.signal, stop.signal])
            : stop.signal
          const diagnostics: UploadDiagnostics = {
            bucket: s3Config.bucket,
            key: fullPath,
            signal,
            stop,
          }
          async function* counted(): AsyncIterable<Uint8Array> {
            try {
              for await (const chunk of toByteStream(data, signal)) {
                size += chunk.byteLength
                yield chunk
              }
            }
            catch (cause) {
              diagnostics.failure ??= { cause }
              stop.abort(cause)
              throw cause
            }
          }
          const stream = Readable.from(counted(), { objectMode: false })
          let upload: Upload | undefined
          try {
            // SDK 负责切片与并发。取消经输入和发送前检查传递，避免 done() 提前返回，确保在途分片已结束再清理。
            const { Upload } = await import('@aws-sdk/lib-storage')
            const multipart = new Upload({
              client: s3Client,
              params: { ...params, Body: stream },
              partSize: s3Config.multipart.partSizeBytes,
              queueSize: s3Config.multipart.queueSize,
              leavePartsOnError: true,
            })
            upload = multipart
            const receipt = await uploadDiagnostics.run(diagnostics, () => multipart.done())
            etag = receipt.ETag
          }
          catch (cause) {
            const failure = diagnostics.failure
            const error = toStorageError(failure ? failure.cause : cause, key)
            const s3Operation = failure?.operation
            let cleanupError: HaiError | undefined
            if (upload?.uploadId) {
              // SDK 在 CompleteMultipartUpload 失败时也可能留下分片。统一在请求收尾后显式清理。
              try {
                await s3Client.send(new AbortMultipartUploadCommand({
                  Bucket: params.Bucket,
                  Key: params.Key,
                  UploadId: upload.uploadId,
                }))
              }
              catch (cleanupCause) {
                if (!(cleanupCause && typeof cleanupCause === 'object'
                  && (('name' in cleanupCause && cleanupCause.name === 'NoSuchUpload')
                    || ('Code' in cleanupCause && cleanupCause.Code === 'NoSuchUpload')))) {
                  cleanupError = toStorageError(cleanupCause)
                }
              }
            }
            if (s3Operation || cleanupError) {
              error.ext = {
                ...error.ext,
                s3Operation,
                ...(cleanupError && { cleanupPending: true, cleanupError }),
              }
            }
            return core.err(error)
          }
          finally {
            stream.destroy()
          }
        }

        // 按本次写入回执返回，避免读取同键被并发覆盖后的对象。
        return core.ok({
          key,
          size,
          contentType: params.ContentType || 'application/octet-stream',
          lastModified: new Date(),
          etag,
          metadata: params.Metadata,
        })
      }
      catch (error) {
        return core.err(toStorageError(error, key))
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
        return core.ok(Buffer.concat(chunks))
      }
      catch (error) {
        return core.err(toStorageError(error, key))
      }
    },

    async getStream(key, options = {}) {
      const opened = await openObject(key, options)
      return opened.success
        ? core.ok(opened.data.stream)
        : opened
    },

    getStreamWithMetadata: (key, options) => openObject(key, { signal: options?.signal }),

    async head(key): Promise<HaiResult<FileMetadata>> {
      try {
        const s3Client = getClient()
        const s3Config = getConfig()
        const fullPath = fullKey(key)

        const response = await s3Client.send(new HeadObjectCommand({
          Bucket: s3Config.bucket,
          Key: fullPath,
        }))

        return core.ok(objectMetadata(key, response))
      }
      catch (error) {
        return core.err(toStorageError(error, key))
      }
    },

    async exists(key): Promise<HaiResult<boolean>> {
      const result = await file.head(key)
      if (result.success) {
        return core.ok(true)
      }
      if (result.error.code === HaiStorageError.NOT_FOUND.code) {
        return core.ok(false)
      }
      return core.err(result.error)
    },

    async delete(key): Promise<HaiResult<void>> {
      try {
        const s3Client = getClient('delete')
        const s3Config = getConfig()
        const fullPath = fullKey(key)

        await s3Client.send(new DeleteObjectCommand({
          Bucket: s3Config.bucket,
          Key: fullPath,
        }))

        return core.ok(undefined)
      }
      catch (error) {
        return core.err(toStorageError(error, key))
      }
    },

    async deleteMany(keys): Promise<StorageDeleteResult> {
      try {
        const s3Client = getClient('delete')
        const s3Config = getConfig()
        const uniqueKeys = [
          ...new Set(keys),
        ]
        const summary: StorageDeleteSummary = { deletedKeys: [], failures: [] }
        for (let offset = 0; offset < uniqueKeys.length; offset += DELETE_BATCH_SIZE) {
          let pending = uniqueKeys.slice(offset, offset + DELETE_BATCH_SIZE)
          for (let attempt = 0; pending.length > 0 && attempt < 3; attempt++) {
            let response
            try {
              response = await s3Client.send(new DeleteObjectsCommand({
                Bucket: s3Config.bucket,
                Delete: {
                  Objects: [
                    ...new Set(pending.map(fullKey)),
                  ].map(Key => ({ Key })),
                  Quiet: false,
                },
              }))
            }
            catch (cause) {
              // 已发送请求的结果可能未知，尚未发送的后续批次不能被标记为已删除。
              const failure = (cause && typeof cause === 'object'
                ? cause
                : {}) as { name?: string, $metadata?: { httpStatusCode?: number } }
              const status = failure.$metadata?.httpStatusCode
              const code = failure.name && /^[\w.-]{1,80}$/.test(failure.name)
                ? failure.name
                : 'RequestFailed'
              const retryable = status === undefined || status === 408 || status === 429 || status >= 500
              const outcome: StorageDeleteFailure['outcome'] = status !== undefined && status >= 400 && status < 500 && status !== 408
                ? 'failed'
                : 'unknown'
              summary.failures.push(...pending.map(key => ({ key, code, retryable, outcome })))
              summary.failures.push(...uniqueKeys.slice(offset + DELETE_BATCH_SIZE).map(key => ({
                key,
                code,
                retryable,
                outcome: 'notAttempted' as const,
              })))
              return toStorageDeleteResult(summary)
            }
            const outcomes = new Map<string, string | null>()
            const requested = new Set(pending.map(fullKey))
            let malformed = false
            // 非 quiet 响应中每个请求键必须恰好出现一次；遗漏、重复和越界都不能宣称成功。
            const items = [
              ...(response.Deleted ?? []).map(item => ({ key: item.Key, code: null })),
              ...(response.Errors ?? []).map(item => ({
                key: item.Key,
                code: item.Code && /^[\w.-]{1,80}$/.test(item.Code)
                  ? item.Code
                  : 'UnknownError',
              })),
            ]
            for (const item of items) {
              if (!item.key || !requested.has(item.key) || outcomes.has(item.key)) {
                malformed = true
                break
              }
              outcomes.set(item.key, item.code)
            }
            if (malformed || outcomes.size !== requested.size) {
              summary.failures.push(...pending.map(key => ({
                key,
                code: 'InvalidDeleteResponse',
                retryable: false,
                outcome: 'unknown' as const,
              })))
              summary.failures.push(...uniqueKeys.slice(offset + DELETE_BATCH_SIZE).map(key => ({
                key,
                code: 'InvalidDeleteResponse',
                retryable: false,
                outcome: 'notAttempted' as const,
              })))
              return toStorageDeleteResult(summary)
            }
            const retry: string[] = []
            for (const key of pending) {
              const code = outcomes.get(fullKey(key))
              if (code === null) {
                summary.deletedKeys.push(key)
              }
              else if (code && RETRYABLE_DELETE_CODES.has(code) && attempt < 2) {
                retry.push(key)
              }
              else {
                summary.failures.push({
                  key,
                  code: code ?? 'UnknownError',
                  retryable: !!code && RETRYABLE_DELETE_CODES.has(code),
                  outcome: 'failed',
                })
              }
            }
            pending = retry
            if (pending.length > 0)
              await new Promise(resolve => setTimeout(resolve, 100 * 2 ** attempt))
          }
        }
        return toStorageDeleteResult(summary)
      }
      catch (error) {
        return core.err(toStorageError(error))
      }
    },

    async copy(sourceKey, destKey, options = {}): Promise<HaiResult<FileMetadata>> {
      const replaceMetadata = options.metadata !== undefined || options.contentType !== undefined
      try {
        const s3Client = getClient()
        const s3Config = getConfig()
        const sourceFullPath = fullKey(sourceKey)
        const destFullPath = fullKey(destKey)
        // CopySource 是 HTTP 头而非 SDK 自动编码的对象路径；逐段编码并保留层级分隔符。
        const copySource = [
          s3Config.bucket,
          ...sourceFullPath.split('/'),
        ]
          .map(part => encodeURIComponent(part).replace(/[!'()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`))
          .join('/')

        const sourceMetadata = replaceMetadata
          ? await s3Client.send(new HeadObjectCommand({ Bucket: s3Config.bucket, Key: sourceFullPath }))
          : undefined
        if (sourceMetadata && !sourceMetadata.ETag)
          return core.err(HaiStorageError.OPERATION_FAILED, storageM('storage_copySourceETagMissing'))

        await s3Client.send(new CopyObjectCommand({
          Bucket: s3Config.bucket,
          CopySource: copySource,
          Key: destFullPath,
          MetadataDirective: replaceMetadata ? 'REPLACE' : 'COPY',
          ...(sourceMetadata && {
            CopySourceIfMatch: sourceMetadata.ETag,
            ContentType: options.contentType ?? sourceMetadata.ContentType,
            Metadata: options.metadata ?? sourceMetadata.Metadata,
            CacheControl: sourceMetadata.CacheControl,
            ContentDisposition: sourceMetadata.ContentDisposition,
            ContentEncoding: sourceMetadata.ContentEncoding,
            ContentLanguage: sourceMetadata.ContentLanguage,
            Expires: sourceMetadata.Expires,
            WebsiteRedirectLocation: sourceMetadata.WebsiteRedirectLocation,
          }),
        }))

        return file.head(destKey)
      }
      catch (error) {
        const failure = toStorageError(error, sourceKey)
        if (replaceMetadata && failure.code === HaiStorageError.ALREADY_EXISTS.code)
          return core.err(HaiStorageError.OPERATION_FAILED, storageM('storage_copySourceChanged'), error)
        return core.err(failure)
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

        const response = await s3Client.send(new ListObjectsV2Command({
          Bucket: s3Config.bucket,
          Prefix: withPrefix(options.prefix ?? '', s3Config.prefix) || undefined,
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

        return core.ok({
          files,
          commonPrefixes,
          nextContinuationToken: response.NextContinuationToken,
          isTruncated: response.IsTruncated || false,
        })
      }
      catch (error) {
        return core.err(toStorageError(error))
      }
    },

    async delete(prefix): Promise<HaiResult<void>> {
      try {
        return await deleteStoragePrefix(prefix, dir.list, file.deleteMany)
      }
      catch (error) {
        return core.err(toStorageError(error))
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
        const s3Client = getClient('presign')
        const s3Config = getConfig()
        const fullPath = fullKey(key)
        const basePath = publicBasePath

        const command = new GetObjectCommand({
          Bucket: s3Config.bucket,
          Key: fullPath,
          ResponseContentType: parsed.responseContentType,
          ResponseContentDisposition: parsed.responseContentDisposition,
        })

        const url = await getSignedUrl(s3Client, command, {
          expiresIn: parsed.expiresIn,
        })

        return core.ok(publicPresignedUrl(url, basePath))
      }
      catch (error) {
        return core.err(
          HaiStorageError.PRESIGN_FAILED,
          storageM('storage_presignUrlFailed'),
          error,
        )
      }
    },

    async putUrl(key, options?): Promise<HaiResult<string>> {
      try {
        const parsed = PresignUploadOptionsSchema.parse(options ?? {})
        const s3Client = getClient('presign')
        const s3Config = getConfig()
        const fullPath = fullKey(key)
        const basePath = publicBasePath

        const command = new PutObjectCommand({
          Bucket: s3Config.bucket,
          Key: fullPath,
          ContentType: parsed.contentType,
        })

        const url = await getSignedUrl(s3Client, command, {
          expiresIn: parsed.expiresIn,
          signableHeaders: new Set(['content-type']),
        })

        return core.ok(publicPresignedUrl(url, basePath))
      }
      catch (error) {
        return core.err(
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
      const url = new URL(s3Config.publicUrl)
      const objectPath = fullKey(key).split('/').map(part => encodeURIComponent(part)).join('/')
      url.pathname = `${trimTrailingSlashes(url.pathname)}/${objectPath}`
      return url.href
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
        return core.err(
          HaiStorageError.CONFIG_ERROR,
          storageM('storage_s3ConfigTypeError'),
        )
      }

      try {
        await closeClients()

        config = cfg
        logger.debug('Connecting S3 provider')

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
        observeUploadRequests(client)
        // 回执丢失时重放可能删除并发新版本；只允许上层对明确的逐项瞬时错误重试。
        deleteClient = new S3Client({ ...clientConfig, maxAttempts: 1 })
        // 签名阶段不联网；不得用外部地址执行内部健康检查，也不能在签名后改写 Host。
        if (cfg.publicEndpoint) {
          const endpoint = new URL(cfg.publicEndpoint)
          publicBasePath = trimTrailingSlashes(endpoint.pathname)
          // 含目录的网关使用桶路径；签名针对网关还原后的 S3 URI，而非入口前缀。
          presignClient = new S3Client({
            ...clientConfig,
            endpoint: endpoint.origin,
            forcePathStyle: publicBasePath ? true : cfg.forcePathStyle,
          })
        }

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
                ...(cfg.region === 'us-east-1'
                  ? {}
                  : {
                      CreateBucketConfiguration: { LocationConstraint: cfg.region as BucketLocationConstraint },
                    }),
              }))
              logger.debug('S3 bucket created')
            }
            catch (createError) {
              // 并发应用仅接受本账号已拥有的桶，并重新核验访问；全局名称冲突不能当成功。
              if (!(createError instanceof Error && createError.name === 'BucketAlreadyOwnedByYou'))
                throw createError
              await client.send(new HeadBucketCommand({ Bucket: cfg.bucket }))
            }
          }
        }

        // 使用与默认列表相同的前缀探测连接，支持限制列表前缀的凭据。
        await client.send(new ListObjectsV2Command({
          Bucket: cfg.bucket,
          Prefix: withPrefix('', cfg.prefix) || undefined,
          MaxKeys: 1,
        }))

        config = cfg
        ready = true
        logger.debug('S3 provider connected')
        return core.ok(undefined)
      }
      catch (error) {
        const original = toStorageError(error)
        try {
          await closeClients()
          return core.err(original)
        }
        catch (cleanupError) {
          return core.err({
            ...original,
            ext: { ...original.ext, cleanupPending: true, cleanupError },
          })
        }
      }
    },

    close: closeClients,

    isConnected(): boolean {
      return ready && client !== null && deleteClient !== null && config !== null
    },
  }
}
