/** Mem0 数据格式适配：复用框架 Embedding，只实现本模块支持的 Qdrant/临时内存存储。 */
import type { EmbeddingOperations } from '../../embedding/ai-embedding-types.js'
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'

const pointSchema = z.object({
  id: z.union([
    z.string(),
    z.number(),
  ]),
  payload: z.record(z.string(), z.unknown()).nullable().optional(),
  vector: z.array(z.number()).optional(),
  score: z.number().optional(),
})
/**
 * 后端响应经校验后的内部向量点；业务主体与内容保存在 payload 中。
 *
 * @example 模块内部上下文
 * ```ts
 * const point: Point = {
 *   id: '00000000-0000-4000-8000-000000000001',
 *   payload: { user_id: 'user-1', data: '偏好中文回复' },
 *   vector: [1, 0],
 * }
 * ```
 */
type Point = z.infer<typeof pointSchema>

/**
 * 从后端数据格式投影的记忆条目；metadata 保留主体与范围供调用方核验。
 *
 * @example 模块内部上下文
 * ```ts
 * const memory: Mem0Item = {
 *   id: '00000000-0000-4000-8000-000000000001',
 *   memory: '偏好中文回复',
 *   metadata: { user_id: 'user-1' },
 * }
 * ```
 */
export interface Mem0Item {
  id: string
  memory: string
  createdAt?: string
  updatedAt?: string
  metadata: Record<string, unknown>
}

/**
 * 数据格式适配所需的现有 Embedding 能力与存储目标；省略 backend 时仅保存在本进程。
 *
 * @example 模块内部上下文
 * ```ts
 * function temporaryOptions(embedding: EmbeddingOperations): Mem0StoreOptions {
 *   return { embedding, collectionName: 'hai_ai_memory', dimension: 1536 }
 * }
 * ```
 */
export interface Mem0StoreOptions {
  embedding: EmbeddingOperations
  collectionName: string
  dimension?: number
  backend?: { url: string, apiKey?: string }
}

/** HTTP 状态只用于区分集合缺失，绝不携带服务端原文或凭证。 */
class BackendHttpError extends Error {
  constructor(readonly status: number) { super(`Memory backend HTTP request failed (${status})`) }
}

function item(point: Point): Mem0Item {
  const payload = point.payload ?? {}
  const { data, createdAt, updatedAt, hash: _hash, textLemmatized: _text, ...metadata } = payload
  return {
    id: String(point.id),
    memory: typeof data === 'string'
      ? data
      : '',
    createdAt: typeof createdAt === 'string'
      ? createdAt
      : undefined,
    updatedAt: typeof updatedAt === 'string'
      ? updatedAt
      : undefined,
    metadata,
  }
}

function expired(point: Point): boolean {
  const value = point.payload?.expiration_date
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && value < new Date().toISOString().slice(0, 10)
}

/** 固定 REST 端点使用原生 fetch，超时覆盖完整响应体，过大响应明确失败。 */
async function request<T>(options: Mem0StoreOptions, suffix: string, method: string, schema: z.ZodType<T>, body?: unknown, serviceRoot = false): Promise<T> {
  const url = new URL(options.backend!.url)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error('Memory backend URL must use HTTP(S) without embedded credentials')
  const [path, query] = suffix.split('?')
  url.pathname = `${url.pathname.replace(/\/$/, '')}${serviceRoot
    ? path || '/'
    : `/collections/${encodeURIComponent(options.collectionName)}${path}`}`
  for (const [key, value] of new URLSearchParams(query)) url.searchParams.set(key, value)
  const response = await fetch(url, {
    method,
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
    headers: {
      'content-type': 'application/json',
      ...(options.backend!.apiKey
        ? { 'api-key': options.backend!.apiKey }
        : {}),
    },
    body: body === undefined
      ? undefined
      : JSON.stringify(body),
  })
  if (!response.ok) {
    await response.body?.cancel()
    throw new BackendHttpError(response.status)
  }
  const reader = response.body?.getReader()
  if (!reader)
    throw new Error('Memory backend response is empty')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done)
        break
      size += chunk.value.byteLength
      if (size > 16 * 1024 * 1024)
        throw new Error('Memory backend response exceeds 16 MiB')
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
    throw new Error('Memory backend returned invalid JSON')
  }
  if (serviceRoot) {
    const service = schema.safeParse(bodyJson)
    if (!service.success)
      throw new Error('Memory backend returned invalid service information')
    return service.data
  }
  const envelope = z.object({
    status: z.literal('ok'),
    result: schema,
  }).safeParse(bodyJson)
  if (!envelope.success)
    throw new Error('Memory backend returned an invalid response')
  return envelope.data.result
}

/**
 * 与上游引擎无生命周期或依赖关系，所有写入等待实际应用。
 *
 * @example 模块内部上下文
 * ```ts
 * async function openTemporaryStore(embedding: EmbeddingOperations) {
 *   const store = await createMem0Store({ embedding, collectionName: 'hai_ai_memory' })
 *   return store
 * }
 * ```
 */
export async function createMem0Store(options: Mem0StoreOptions) {
  const points = new Map<string, Point>()
  const embedding = async (text: string) => {
    const result = await options.embedding.embedText(text)
    if (!result.success)
      throw new Error('Memory embedding failed', { cause: result.error })
    if (!result.data.length || result.data.some(value => !Number.isFinite(value)))
      throw new Error('Memory embedding is invalid')
    return result.data
  }
  const filter = (objectId: string) => ({
    must: [
      {
        key: 'user_id',
        match: { value: objectId },
      },
    ],
  })
  if (options.backend) {
    const service = await request(options, '', 'GET', z.object({
      version: z.string(),
    }), undefined, true)
    const version = /^(\d+)\.(\d+)/.exec(service.version)
    if (!version || Number(version[1]) < 1 || (Number(version[1]) === 1 && Number(version[2]) < 19))
      throw new Error('Mem0 data storage requires Qdrant 1.19 or newer for conditional updates')
    const schema = z.object({
      config: z.object({
        params: z.object({
          vectors: z.unknown(),
        }),
      }),
    })
    let info: z.infer<typeof schema>
    try {
      info = await request(options, '', 'GET', schema)
    }
    catch (error) {
      if (!(error instanceof BackendHttpError) || error.status !== 404)
        throw error
      const dimension = options.dimension ?? (await embedding('Memory dimension probe')).length
      try {
        await request(options, '', 'PUT', z.boolean(), {
          vectors: { size: dimension, distance: 'Cosine' },
        })
      }
      catch (creationError) {
        if (!(creationError instanceof BackendHttpError) || creationError.status !== 409)
          throw creationError
      }
      info = await request(options, '', 'GET', schema)
    }
    const vector = info.config.params.vectors
    if (!vector || typeof vector !== 'object' || !('size' in vector) || typeof vector.size !== 'number' || !('distance' in vector) || vector.distance !== 'Cosine' || (options.dimension && options.dimension !== vector.size))
      throw new Error('Mem0 data storage requires a matching unnamed cosine vector collection')
  }

  const getPoint = async (id: string): Promise<Point | undefined> => options.backend
    ? (await request(options, '/points?consistency=all', 'POST', z.array(pointSchema), {
        ids: [id],
        with_payload: true,
        with_vector: true,
      }))[0]
    : structuredClone(points.get(id))
  const write = async (point: Point, expected?: Point, objectId?: string) => {
    if (options.backend) {
      const previousRevision = expected?.payload?.hai_revision
      const updateFilter = expected
        ? {
            must: [
              {
                key: 'user_id',
                match: { value: objectId },
              },
              typeof previousRevision === 'string'
                ? {
                    key: 'hai_revision',
                    match: { value: previousRevision },
                  }
                : {
                    is_empty: { key: 'hai_revision' },
                  },
            ],
          }
        : undefined
      // update_only 与 update_filter 在存储端同一次写入生效，已删除点和过期读不能被重新插入。
      await request(options, '/points?wait=true&ordering=strong', 'PUT', z.object({
        status: z.literal('completed'),
      }), {
        points: [point],
        update_mode: expected ? 'update_only' : 'insert_only',
        ...(updateFilter
          ? { update_filter: updateFilter }
          : {}),
      })
      if (expected) {
        const committed = await getPoint(String(point.id))
        if (committed?.payload?.hai_revision !== point.payload?.hai_revision)
          throw new Error('Memory changed or was deleted during update')
      }
    }
    else {
      const current = points.get(String(point.id))
      if (expected && (!current || current.payload?.user_id !== objectId || current.payload?.hai_revision !== expected.payload?.hai_revision))
        throw new Error('Memory changed or was deleted during update')
      points.set(String(point.id), structuredClone(point))
    }
  }
  const remove = async (id: string) => {
    if (options.backend) {
      await request(options, '/points/delete?wait=true&ordering=strong', 'POST', z.object({
        status: z.literal('completed'),
      }), {
        points: [id],
      })
    }
    else {
      points.delete(id)
    }
  }
  return {
    async add(content: string, objectId: string, metadata: Record<string, unknown>): Promise<string> {
      const id = randomUUID()
      // hash 仅为兼容既有数据字段的内容指纹，不参与鉴权、签名或安全校验。
      await write({
        id,
        vector: await embedding(content),
        payload: {
          ...metadata,
          user_id: objectId,
          data: content,
          hai_revision: randomUUID(),
          hash: createHash('sha256').update(content).digest('hex'),
          createdAt: new Date().toISOString(),
        },
      })
      return id
    },
    async get(id: string): Promise<Mem0Item | undefined> {
      const point = await getPoint(id)
      return point
        ? item(point)
        : undefined
    },
    async update(id: string, content: string | undefined, metadata: Record<string, unknown>, objectId: string): Promise<void> {
      const point = await getPoint(id)
      if (!point || point.payload?.user_id !== objectId)
        throw new Error('Memory was deleted or changed owner before update')
      const text = content ?? String(point.payload?.data ?? '')
      const vector = content === undefined && point.vector
        ? point.vector
        : await embedding(text)
      await write({
        ...point,
        vector,
        payload: {
          ...point.payload,
          ...metadata,
          user_id: objectId,
          hai_object_id: objectId,
          hai_revision: randomUUID(),
          data: text,
          hash: createHash('sha256').update(text).digest('hex'),
          updatedAt: new Date().toISOString(),
        },
      }, point, objectId)
    },
    remove,
    async list(objectId: string, limit: number): Promise<Mem0Item[]> {
      const result = options.backend
        ? (await request(options, '/points/scroll', 'POST', z.object({
            points: z.array(pointSchema),
          }), {
            filter: filter(objectId),
            limit,
            with_payload: true,
          })).points
        : [
            ...points.values(),
          ].filter(point => point.payload?.user_id === objectId).slice(0, limit)
      return result.map(item)
    },
    async search(query: string, objectId: string, limit: number): Promise<Mem0Item[]> {
      const vector = await embedding(query)
      let result: Point[]
      if (options.backend) {
        result = (await request(options, '/points/query', 'POST', z.object({
          points: z.array(pointSchema),
        }), {
          query: vector,
          filter: filter(objectId),
          limit: Math.max(limit * 4, 60),
          with_payload: true,
        })).points
      }
      else {
        const magnitude = (values: number[]) => Math.sqrt(values.reduce((sum, value) => sum + value * value, 0))
        result = [
          ...points.values(),
        ].filter(point => point.payload?.user_id === objectId).map(point => ({ ...point, score: (point.vector ?? []).reduce((sum, value, index) => sum + value * (vector[index] ?? 0), 0) / (magnitude(point.vector ?? []) * magnitude(vector) || 1) })).sort((a, b) => b.score - a.score)
      }
      return result.filter(point => !expired(point)).slice(0, limit).map(item)
    },
    async removeObject(objectId: string): Promise<void> {
      if (options.backend) {
        await request(options, '/points/delete?wait=true&ordering=strong', 'POST', z.object({
          status: z.literal('completed'),
        }), {
          filter: filter(objectId),
        })
      }
      else {
        for (const [id, point] of points) {
          if (point.payload?.user_id === objectId)
            points.delete(id)
        }
      }
    },
    async clear(): Promise<void> {
      if (options.backend) {
        await request(options, '/points/delete?wait=true&ordering=strong', 'POST', z.object({
          status: z.literal('completed'),
        }), {
          filter: { must: [] },
        })
      }
      else {
        points.clear()
      }
    },
  }
}

/**
 * 适配存储实例；调用方负责在读取后核验业务主体与范围。
 *
 * @example 模块内部上下文
 * ```ts
 * async function inspect(store: Mem0Store, id: string) {
 *   return store.get(id)
 * }
 * ```
 */
export type Mem0Store = Awaited<ReturnType<typeof createMem0Store>>
