/** Qdrant 固定 REST 端点；使用 Node 原生 fetch，不加载独立 HTTP 驱动。 */
import type { QdrantResponse, QdrantResponseKind } from './vecdb-qdrant-response.js'
import { core } from '@h-ai/core'
import { providerPool } from './vecdb-provider-pool.js'
import { decodeQdrantResponse } from './vecdb-qdrant-response.js'

const MAX_RESPONSE_BYTES = 16 * 1024 * 1024
export { MAX_QDRANT_POINT_ID } from './vecdb-qdrant-response.js'
const rawJSON = (JSON as JSON & { rawJSON: (text: string) => object }).rawJSON

/**
 * 只携带状态码，不把服务端响应、连接地址或认证头带入业务异常。
 *
 * @example 模块内部上下文
 * ```ts
 * const failure = new QdrantHttpError(503)
 * const unavailable = failure.status === 503
 * ```
 */
export class QdrantHttpError extends Error {
  constructor(readonly status: number) {
    super(`Qdrant HTTP request failed (${status})`)
  }
}

/**
 * 本包使用的固定端点集合，不提供任意 URL 或任意 SDK 调用透传。
 *
 * @example 模块内部上下文
 * ```ts
 * async function inspectCollections(url: string) {
 *   const client = new QdrantRestClient(url)
 *   return client.getCollections()
 * }
 * ```
 */
export class QdrantRestClient {
  private readonly base: URL

  constructor(url: string, private readonly apiKey?: string) {
    this.base = new URL(url)
    if (!['http:', 'https:'].includes(this.base.protocol) || this.base.username || this.base.password)
      throw new Error('Qdrant URL must use HTTP(S) without embedded credentials')
  }

  private async perform<Kind extends QdrantResponseKind>(path: string, method: string, operation: Kind, body?: unknown, maxPoints?: number): Promise<QdrantResponse[Kind]> {
    const url = new URL(this.base)
    const [pathname, query] = path.split('?')
    url.pathname = `${url.pathname.replace(/\/$/, '')}${pathname}`
    for (const [key, value] of new URLSearchParams(query)) url.searchParams.set(key, value)
    const response = await fetch(url, {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
      headers: {
        'content-type': 'application/json',
        ...(this.apiKey
          ? { 'api-key': this.apiKey }
          : {}),
      },
      body: body === undefined
        ? undefined
        : JSON.stringify(body),
    })
    if (!response.ok) {
      await response.body?.cancel()
      throw new QdrantHttpError(response.status)
    }
    const reader = response.body?.getReader()
    if (!reader)
      throw new Error('Qdrant response body is missing')
    let size = 0
    const chunks: Uint8Array[] = []
    try {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done)
          break
        size += chunk.value.byteLength
        if (size > MAX_RESPONSE_BYTES)
          throw new Error('Qdrant response exceeds 16 MiB')
        chunks.push(chunk.value)
      }
    }
    finally {
      await reader.cancel().catch(() => undefined)
      reader.releaseLock()
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    if (bytes.length < 256 * 1024)
      return decodeQdrantResponse(operation, bytes, maxPoints)
    const result = await providerPool.run({
      kind: 'qdrant',
      operation,
      bytes,
      maxPoints,
    }, [bytes.buffer])
    if (!result.success || result.data.kind !== 'qdrant')
      throw new Error('Qdrant returned an invalid response')
    // 同一个固定端点的 schema 在线程内已核对，结果联合类型在此收窄。
    return result.data.value as QdrantResponse[Kind]
  }

  private async request<Kind extends QdrantResponseKind>(path: string, method: string, operation: Kind, body?: unknown, maxPoints?: number): Promise<QdrantResponse[Kind]> {
    try {
      return await this.perform(path, method, operation, body, maxPoints)
    }
    catch (error) {
      if (error instanceof QdrantHttpError)
        throw error
      core.logger.child({ module: 'vecdb', scope: 'qdrant-http' }).error('Qdrant HTTP transport failed', {
        error: core.sanitize.sanitizeSensitiveFields(error),
      })
      throw new Error('Qdrant request failed')
    }
  }

  getCollections() { return this.request('/collections', 'GET', 'list') }

  getCollection(name: string) { return this.request(`/collections/${encodeURIComponent(name)}`, 'GET', 'collection') }
  createCollection(name: string, options: { vectors: { size: number, distance: string } }) { return this.request(`/collections/${encodeURIComponent(name)}`, 'PUT', 'changed', options) }
  deleteCollection(name: string) { return this.request(`/collections/${encodeURIComponent(name)}`, 'DELETE', 'changed') }
  upsert(name: string, options: { points: Array<{ id: string, vector: number[], payload: Record<string, unknown> }>, wait: boolean }) {
    return this.request(`/collections/${encodeURIComponent(name)}/points?wait=${options.wait}`, 'PUT', 'write', { points: options.points })
  }

  delete(name: string, options: { points: string[], wait: boolean }) {
    return this.request(`/collections/${encodeURIComponent(name)}/points/delete?wait=${options.wait}`, 'POST', 'write', { points: options.points })
  }

  query(name: string, options: {
    query: number[]
    limit: number
    filter?: {
      must: Array<{ key: string, match: { value: unknown } }>
      must_not?: Array<{ is_empty: { key: string } }>
    }
    with_payload: boolean
  }) {
    return this.request(`/collections/${encodeURIComponent(name)}/points/query`, 'POST', 'query', options)
  }

  scroll(name: string, limit: number, offset?: string | bigint) {
    return this.request(`/collections/${encodeURIComponent(name)}/points/scroll`, 'POST', 'scroll', {
      limit,
      offset: typeof offset === 'bigint'
        ? rawJSON(String(offset))
        : offset,
      with_payload: ['_id'],
      with_vector: false,
    }, limit)
  }

  count(name: string, options: { exact: boolean }) {
    return this.request(`/collections/${encodeURIComponent(name)}/points/count`, 'POST', 'count', options)
  }
}
