/**
 * @h-ai/serv — Storage 只读资源 middleware
 *
 * 将经过路径与 MIME 白名单校验的 `@h-ai/storage` 文件作为 HTTP 资源返回，
 * 统一处理 GET/HEAD、ETag 与缓存响应头，不包含头像等业务领域概念。
 * @module serv-storage-assets
 */

import type { StorageFunctions } from '@h-ai/storage'
import type { ServMiddleware } from './pipelines/serv-pipeline-types.js'

/** 可由只读资源 middleware 使用的最小 Storage 能力。 */
interface StorageAssetSource {
  readonly file: Pick<StorageFunctions['file'], 'get' | 'head'>
}

/** Storage 只读资源 middleware 配置。 */
export interface ServStorageAssetsConfig {
  /** 已初始化的 Storage 模块或等价文件读取能力。 */
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
 * 仅允许 GET/HEAD；非法路径、非白名单 MIME 与 Storage 读取失败统一返回 404，
 * 避免向外暴露文件是否存在或后端错误细节。
 *
 * @param config - Storage、路径、key、MIME 与缓存策略。
 * @returns 可挂载到 `serv.createApp({ middlewares })` 的 middleware。
 * @example
 * ```ts
 * const middleware = serv.storageAssets({
 *   storage,
 *   pathPrefix: '/api/v1/avatar-assets/',
 *   keyPattern: /^avatars\/[\w-]+\/[\w-]+\.webp$/,
 *   allowedContentTypes: ['image/webp'],
 *   cacheControl: 'public, max-age=31536000, immutable',
 * })
 * ```
 */
export function storageAssets(config: ServStorageAssetsConfig): ServMiddleware {
  const pathPrefix = config.pathPrefix.endsWith('/') ? config.pathPrefix : `${config.pathPrefix}/`
  const allowedKeyPattern = new RegExp(config.keyPattern.source, config.keyPattern.flags.replace(/[gy]/g, ''))
  const allowedContentTypes = new Set(config.allowedContentTypes)

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

    const metadata = await config.storage.file.head(key)
    if (!metadata.success || !allowedContentTypes.has(metadata.data.contentType))
      return notFound(c)

    const headers: Record<string, string> = {
      'Cache-Control': config.cacheControl ?? 'no-store',
      'Content-Length': String(metadata.data.size),
      'Content-Type': metadata.data.contentType,
      ...(config.crossOriginResourcePolicy
        ? { 'Cross-Origin-Resource-Policy': config.crossOriginResourcePolicy }
        : {}),
      ...(metadata.data.etag ? { ETag: metadata.data.etag } : {}),
    }
    if (metadata.data.etag && matchesEtag(request.headers.get('if-none-match'), metadata.data.etag))
      return c.body(null, 304, headers)
    if (request.method === 'HEAD')
      return c.body(null, 200, headers)

    const file = await config.storage.file.get(key)
    if (!file.success)
      return notFound(c)
    return c.body(Uint8Array.from(file.data).buffer, 200, headers)
  }
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
    return match?.[0] === key ? key : undefined
  }
  catch {
    return undefined
  }
}

/** 按 HTTP 弱比较语义匹配 If-None-Match。 */
function matchesEtag(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch)
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
