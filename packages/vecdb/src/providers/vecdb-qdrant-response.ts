import { z } from 'zod'

/**
 * Qdrant 数字 point ID 使用完整 uint64 范围。
 * @example 模块内部上下文
 * ```ts
 * const maxPointId = MAX_QDRANT_POINT_ID.toString()
 * ```
 */
export const MAX_QDRANT_POINT_ID = 18_446_744_073_709_551_615n
const scrollIdSchema = z.union([
  z.guid(),
  z.bigint().min(0n).max(MAX_QDRANT_POINT_ID),
])

// Node 22+ 支持保留 JSON 数值原文。仅 scroll 使用该模式，其余端点保留普通 JSON 语义。
const parseWithSource = JSON.parse as (text: string, reviver: (key: string, value: unknown, context?: { source?: string }) => unknown) => unknown

function parseScrollJson(text: string): unknown {
  return parseWithSource(text, (key, value, context) => {
    const source = context?.source
    if ((key === 'id' || key === 'next_page_offset') && typeof value === 'number' && source && /^\d{1,20}$/.test(source))
      return BigInt(source)
    return value
  })
}
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

const schemas = {
  list: z.object({
    collections: z.array(z.object({
      name: z.string(),
    })),
  }),
  collection: collectionSchema,
  changed: z.boolean(),
  write: z.object({
    status: z.literal('completed'),
  }),
  query: z.object({
    points: z.array(pointSchema.extend({
      score: z.number(),
    })),
  }),
  scroll: z.object({
    points: z.array(z.object({
      id: scrollIdSchema,
      payload: z.object({
        _id: z.unknown().optional(),
      }).nullable().optional(),
    })),
    next_page_offset: scrollIdSchema.nullish(),
  }),
  count: z.object({
    count: z.number(),
  }),
}

/**
 * 固定端点的响应类型。
 * @example 模块内部上下文
 * ```ts
 * const kind: QdrantResponseKind = 'scroll'
 * ```
 */
export type QdrantResponseKind = keyof typeof schemas

/**
 * 各响应沿用 Qdrant 原始类型，包括 scroll 的 uint64 ID。
 * @example 模块内部上下文
 * ```ts
 * const result: QdrantResponse['count'] = { count: 1 }
 * ```
 */
export type QdrantResponse = { [Kind in QdrantResponseKind]: z.infer<(typeof schemas)[Kind]> }

/**
 * 同时在宿主和 Worker 校验固定响应协议，保留 scroll 边界。
 * @example 模块内部上下文
 * ```ts
 * const count = decodeQdrantResponse('count', new TextEncoder().encode('{"status":"ok","result":{"count":1}}'))
 * ```
 */
export function decodeQdrantResponse<Kind extends QdrantResponseKind>(
  operation: Kind,
  bytes: Uint8Array,
  maxPoints?: number,
): QdrantResponse[Kind] {
  let body: unknown
  try {
    const text = new TextDecoder().decode(bytes)
    body = operation === 'scroll'
      ? parseScrollJson(text)
      : JSON.parse(text)
  }
  catch {
    throw new Error('Qdrant returned invalid JSON')
  }
  const envelope = z.object({
    status: z.literal('ok'),
    result: z.unknown(),
  }).safeParse(body)
  if (!envelope.success)
    throw new Error('Qdrant returned an invalid response')
  const result = schemas[operation].safeParse(envelope.data.result)
  if (!result.success || (operation === 'scroll' && maxPoints !== undefined
    && (result.data as QdrantResponse['scroll']).points.length > maxPoints)) {
    throw new Error('Qdrant returned an invalid response')
  }
  return result.data as QdrantResponse[Kind]
}
