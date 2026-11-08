/** Qdrant 固定 REST 端点；使用 Node 原生 fetch，不加载独立 HTTP 驱动。 */
import { core } from '@h-ai/core'
import { z } from 'zod'

const MAX_RESPONSE_BYTES = 16 * 1024 * 1024
const pointSchema = z.object({
  id: z.union([
    z.string(),
    z.number(),
  ]),
  score: z.number().optional(),
  payload: z.record(z.string(), z.unknown()).nullable().optional(),
  vector: z.array(z.number()).optional(),
})
const collectionSchema = z.object({
  config: z.object({
    params: z.object({
      vectors: z.unknown(),
    }),
  }),
  points_count: z.number().nullable().optional(),
})

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

  private async perform<T>(path: string, method: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
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
    let bodyJson: unknown
    try {
      bodyJson = JSON.parse(new TextDecoder().decode(bytes))
    }
    catch {
      throw new Error('Qdrant returned invalid JSON')
    }
    const envelope = z.object({
      status: z.literal('ok'),
      result: schema,
    }).safeParse(bodyJson)
    if (!envelope.success)
      throw new Error('Qdrant returned an invalid response')
    return envelope.data.result
  }

  private async request<T>(path: string, method: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
    try {
      return await this.perform(path, method, schema, body)
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

  getCollections() {
    return this.request('/collections', 'GET', z.object({
      collections: z.array(z.object({
        name: z.string(),
      })),
    }))
  }

  getCollection(name: string) { return this.request(`/collections/${encodeURIComponent(name)}`, 'GET', collectionSchema) }
  createCollection(name: string, options: { vectors: { size: number, distance: string } }) { return this.request(`/collections/${encodeURIComponent(name)}`, 'PUT', z.boolean(), options) }
  deleteCollection(name: string) { return this.request(`/collections/${encodeURIComponent(name)}`, 'DELETE', z.boolean()) }
  upsert(name: string, options: { points: Array<{ id: string, vector: number[], payload: Record<string, unknown> }>, wait: boolean }) {
    return this.request(`/collections/${encodeURIComponent(name)}/points?wait=${options.wait}`, 'PUT', z.object({
      status: z.literal('completed'),
    }), { points: options.points })
  }

  delete(name: string, options: { points: string[], wait: boolean }) {
    return this.request(`/collections/${encodeURIComponent(name)}/points/delete?wait=${options.wait}`, 'POST', z.object({
      status: z.literal('completed'),
    }), { points: options.points })
  }

  query(name: string, options: { query: number[], limit: number, filter?: { must: Array<{ key: string, match: { value: unknown } }> }, with_payload: boolean }) {
    return this.request(`/collections/${encodeURIComponent(name)}/points/query`, 'POST', z.object({
      points: z.array(pointSchema.extend({
        score: z.number(),
      })),
    }), options)
  }

  count(name: string, options: { exact: boolean }) {
    return this.request(`/collections/${encodeURIComponent(name)}/points/count`, 'POST', z.object({
      count: z.number(),
    }), options)
  }
}
