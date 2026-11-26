/**
 * @h-ai/serv — Storage 只读资源 middleware
 *
 * 将经过路径与 MIME 白名单校验的 `@h-ai/storage` 文件作为 HTTP 资源返回，
 * 统一处理 GET/HEAD、ETag 与缓存响应头，不包含头像等业务领域概念。
 * @module serv-storage-assets
 */

import type { FileMetadata, StorageFileRead, StorageFunctions } from '@h-ai/storage'
import type { ServMiddleware } from './pipelines/serv-pipeline-types.js'
import { STORAGE_PROXY_MAX_FILE_BYTES } from '@h-ai/api-contract'

/**
 * 可由只读资源 middleware 使用的最小 Storage 能力。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * function withStorage(source: StorageAssetSource): ServStorageAssetsConfig {
 *   return { storage: source, pathPrefix: '/assets/', keyPattern: new RegExp('^public/[a-z0-9-]+[.]webp$'), allowedContentTypes: ['image/webp'] }
 * }
 * ```
 */
interface StorageAssetSource {
  readonly file: Pick<StorageFunctions['file'], 'getStreamWithMetadata' | 'head'>
}

/**
 * Storage 只读资源 middleware 配置。
 *
 * @example
 * ```ts
 * import { serv } from '@h-ai/serv'
 * import { storage } from '@h-ai/storage'
 *
 * // 仅发布明确公共资源；私有业务资源另执行可信资源授权。
 * const middleware = serv.storageAssets({ storage, pathPrefix: '/assets/', keyPattern: new RegExp('^public/[a-z0-9-]+[.]webp$'), allowedContentTypes: ['image/webp'], cacheControl: 'public, max-age=3600' })
 * ```
 */
export interface ServStorageAssetsConfig {
  /** 已初始化的 Storage 模块或提供 head 和 getStreamWithMetadata 的适配器。 */
  readonly storage: StorageAssetSource
  /**
   * 从请求 pathname 中移除的路由前缀，例如 `/api/v1/assets/`。
   * 是否挂载通配符仍由 `createApp({ middlewares })` 的 `path` 决定。
   */
  readonly pathPrefix: `/${string}`
  /** 允许访问的完整 Storage key 白名单；框架仍会先拒绝路径穿越与非法 key。 */
  readonly keyPattern: RegExp
  /** 允许返回的 MIME 白名单。 */
  readonly allowedContentTypes: readonly string[]
  /** Cache-Control 响应头，默认 `no-store`。 */
  readonly cacheControl?: string
  /** 可选的 Cross-Origin-Resource-Policy 响应头。 */
  readonly crossOriginResourcePolicy?: 'same-origin' | 'same-site' | 'cross-origin'
}

/**
 * 创建由 Storage 提供内容的只读资源 middleware。
 *
 * 仅允许 GET/HEAD；非法路径、非白名单 MIME、文件超限与 Storage 读取失败统一返回 404，
 * 避免向外暴露文件是否存在或后端错误细节。
 * 文件上限沿用 Storage HTTP 代理的 5 MiB，GET 从同一次读取检查元数据和实际正文字节数。
 *
 * @param config - Storage、路径、key、MIME 与缓存策略。
 * @returns 可挂载到 `serv.createApp({ middlewares })` 的 middleware。
 *
 * @example
 * ```ts
 * import { serv } from '@h-ai/serv'
 * import { storage } from '@h-ai/storage'
 *
 * // 仅发布明确公共资源；私有业务资源另执行可信资源授权。
 * const middleware = serv.storageAssets({ storage, pathPrefix: '/assets/', keyPattern: new RegExp('^public/[a-z0-9-]+[.]webp$'), allowedContentTypes: ['image/webp'], cacheControl: 'public, max-age=3600' })
 * ```
 */
export function storageAssets(config: ServStorageAssetsConfig): ServMiddleware {
  const pathPrefix = config.pathPrefix.endsWith('/')
    ? config.pathPrefix
    : `${config.pathPrefix}/`
  const allowedKeyPattern = new RegExp(config.keyPattern.source, config.keyPattern.flags.replace(/[gy]/g, ''))
  const allowedContentTypes = new Set(config.allowedContentTypes)

  function isAllowed(metadata: FileMetadata): boolean {
    return allowedContentTypes.has(metadata.contentType)
      && Number.isSafeInteger(metadata.size)
      && metadata.size >= 0 && metadata.size <= STORAGE_PROXY_MAX_FILE_BYTES
  }

  function responseHeaders(metadata: FileMetadata, size = metadata.size): Record<string, string> {
    return {
      'Cache-Control': config.cacheControl ?? 'no-store',
      'Content-Length': String(size),
      'Content-Type': metadata.contentType,
      ...(config.crossOriginResourcePolicy
        ? { 'Cross-Origin-Resource-Policy': config.crossOriginResourcePolicy }
        : {}),
      ...(metadata.etag
        ? { ETag: metadata.etag }
        : {}),
    }
  }

  return async (c) => {
    const request = c.req.raw
    const path = new URL(request.url).pathname
    if (request.method !== 'GET' && request.method !== 'HEAD')
      return c.body(null, 405, { Allow: 'GET, HEAD' })
    if (!path.startsWith(pathPrefix))
      return notFound(c)

    const key = decodeStorageAssetKey(path.slice(pathPrefix.length), allowedKeyPattern)
    if (!key)
      return notFound(c)

    const ifNoneMatch = request.headers.get('if-none-match')
    try {
      if (request.method === 'HEAD') {
        const result = await config.storage.file.head(key)
        if (!result.success || !isAllowed(result.data))
          return notFound(c)
        const status = matchesEtag(ifNoneMatch, result.data.etag)
          ? 304
          : 200
        return c.body(null, status, responseHeaders(result.data))
      }

      const result = await config.storage.file.getStreamWithMetadata(key, { signal: request.signal })
      if (!result.success)
        return notFound(c)

      const { metadata, stream } = result.data
      let body: Uint8Array<ArrayBuffer> | null = null
      try {
        if (!isAllowed(metadata))
          return notFound(c)

        if (!matchesEtag(ifNoneMatch, metadata.etag)) {
          // 在发送 200 前读完正文，读取失败仍可返回无详情的 404。
          const content = await readAsset(stream, metadata.size, request.signal)
          if (!content)
            return notFound(c)
          body = content
        }
      }
      finally {
        await result.data.close()
      }
      return body === null
        ? c.body(null, 304, responseHeaders(metadata))
        : c.body(body, 200, responseHeaders(metadata, body.byteLength))
    }
    catch {
      return notFound(c)
    }
  }
}

async function readAsset(
  stream: StorageFileRead['stream'],
  expectedBytes: number,
  signal: AbortSignal,
): Promise<Uint8Array<ArrayBuffer> | undefined> {
  signal.throwIfAborted()
  // 按元数据预分配，实际长度有出入时只在固定上限内扩容。
  let body = new Uint8Array(expectedBytes)
  let size = 0
  for await (const chunk of stream) {
    signal.throwIfAborted()
    const nextSize = size + chunk.byteLength
    if (nextSize > STORAGE_PROXY_MAX_FILE_BYTES)
      return undefined
    if (nextSize > body.byteLength) {
      const grown = new Uint8Array(Math.min(STORAGE_PROXY_MAX_FILE_BYTES, Math.max(nextSize, body.byteLength * 2)))
      grown.set(body)
      body = grown
    }
    body.set(chunk, size)
    size = nextSize
  }
  signal.throwIfAborted()
  return body.subarray(0, size)
}

/** 解码并校验资源 key，拒绝绝对路径、反斜杠、NUL 与点路径段。 */
function decodeStorageAssetKey(value: string, allowedKeyPattern: RegExp): string | undefined {
  try {
    const key = decodeURIComponent(value)
    if (
      key.length === 0
      || key.length > 1024
      || key.startsWith('/')
      || key.includes('\\')
      || key.includes('\0')
      || key.split('/').some(segment => segment === '.' || segment === '..')
    ) {
      return undefined
    }
    const match = allowedKeyPattern.exec(key)
    return match?.[0] === key
      ? key
      : undefined
  }
  catch {
    return undefined
  }
}

/** 按 HTTP 弱比较语义匹配 If-None-Match。 */
function matchesEtag(ifNoneMatch: string | null, etag: string | undefined): boolean {
  if (!ifNoneMatch || !etag)
    return false
  if (ifNoneMatch.trim() === '*')
    return true
  const expected = normalizeEtag(etag)
  return ifNoneMatch.split(',').some(candidate => normalizeEtag(candidate) === expected)
}

function normalizeEtag(value: string): string {
  return value.trim().replace(/^W\//i, '')
}

function notFound(c: Parameters<ServMiddleware>[0]): Response {
  return c.body(null, 404, { 'Cache-Control': 'no-store' })
}
