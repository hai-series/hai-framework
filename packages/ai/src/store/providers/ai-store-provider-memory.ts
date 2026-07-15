/**
 * @h-ai/ai — 进程内临时 Store Provider
 *
 * 为 LLM-only、工具和本地原型提供零外部依赖的默认体验。数据只存在于当前进程，
 * 不提供 KnowledgeStore，也不应作为多实例或需要持久化的生产存储使用。
 * @module ai-store-provider-memory
 */

import type {
  AIRelStore,
  AIStoreProvider,
  AIVectorStore,
  StoreFilter,
  StoreScope,
  WhereOperator,
} from '../ai-store-types.js'

interface StoredValue {
  data: unknown
  scope?: StoreScope
}

interface StoredVector {
  vector: number[]
  metadata?: Record<string, unknown>
}

function isWhereOperator(value: unknown): value is WhereOperator<unknown> {
  return typeof value === 'object'
    && value !== null
    && ['$in', '$gte', '$gt', '$lte', '$lt'].some(key => key in value)
}

function compare(left: unknown, right: unknown): number {
  if (typeof left === 'number' && typeof right === 'number')
    return left - right
  return String(left ?? '').localeCompare(String(right ?? ''))
}

function matchesOperator(value: unknown, operator: WhereOperator<unknown>): boolean {
  if (operator.$in && !operator.$in.some(candidate => Object.is(candidate, value)))
    return false
  if (operator.$gte !== undefined && compare(value, operator.$gte) < 0)
    return false
  if (operator.$gt !== undefined && compare(value, operator.$gt) <= 0)
    return false
  if (operator.$lte !== undefined && compare(value, operator.$lte) > 0)
    return false
  if (operator.$lt !== undefined && compare(value, operator.$lt) >= 0)
    return false
  return true
}

function matchesRecord<T>(record: StoredValue, filter: StoreFilter<T>): boolean {
  if (filter.objectId !== undefined && record.scope?.objectId !== filter.objectId)
    return false
  if (filter.sessionId !== undefined && record.scope?.sessionId !== filter.sessionId)
    return false
  if (filter.refId !== undefined && record.scope?.refId !== filter.refId)
    return false
  if (filter.status !== undefined) {
    const statuses = Array.isArray(filter.status) ? filter.status : [filter.status]
    if (!record.scope?.status || !statuses.includes(record.scope.status))
      return false
  }

  const data = record.data as Record<string, unknown>
  if (filter.where) {
    for (const [key, expected] of Object.entries(filter.where)) {
      const actual = data[key]
      if (isWhereOperator(expected)) {
        if (!matchesOperator(actual, expected))
          return false
      }
      else if (!Object.is(actual, expected)) {
        return false
      }
    }
  }

  if (filter.scope) {
    const dataScope = data.scope
    if (typeof dataScope !== 'object' || dataScope === null)
      return false
    for (const [key, expected] of Object.entries(filter.scope)) {
      if (!Object.is((dataScope as Record<string, unknown>)[key], expected))
        return false
    }
  }

  return true
}

function createRelStore<T>(records: Map<string, StoredValue>): AIRelStore<T> {
  function select(filter: StoreFilter<T>): T[] {
    let values = Array.from(records.values())
      .filter(record => matchesRecord(record, filter))
      .map(record => record.data as T)

    if (filter.orderBy) {
      const { field, direction } = filter.orderBy
      const multiplier = direction === 'asc' ? 1 : -1
      values = values.sort((left, right) => compare(left[field], right[field]) * multiplier)
    }
    if (filter.limit !== undefined)
      values = values.slice(0, Math.max(0, filter.limit))
    return values
  }

  return {
    async save(id, data, scope) {
      records.set(id, { data, scope })
    },
    async saveMany(items) {
      for (const item of items)
        records.set(item.id, { data: item.data, scope: item.scope })
    },
    async get(id) {
      return records.get(id)?.data as T | undefined
    },
    async query(filter) {
      return select(filter)
    },
    async queryPage(filter, page) {
      const values = select({ ...filter, limit: undefined })
      return {
        items: values.slice(page.offset, page.offset + page.limit),
        total: values.length,
      }
    },
    async remove(id) {
      return records.delete(id)
    },
    async removeBy(filter) {
      const ids = Array.from(records.entries())
        .filter(([, record]) => matchesRecord(record, filter))
        .map(([id]) => id)
      for (const id of ids)
        records.delete(id)
      return ids.length
    },
    async count(filter = {}) {
      return select({ ...filter, limit: undefined }).length
    },
    async clear(filter) {
      if (!filter) {
        records.clear()
        return
      }
      const ids = Array.from(records.entries())
        .filter(([, record]) => matchesRecord(record, filter))
        .map(([id]) => id)
      for (const id of ids)
        records.delete(id)
    },
  }
}

function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length !== right.length || left.length === 0)
    return 0
  let dot = 0
  let leftNorm = 0
  let rightNorm = 0
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index]
    leftNorm += left[index] ** 2
    rightNorm += right[index] ** 2
  }
  if (leftNorm === 0 || rightNorm === 0)
    return 0
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm))
}

function createVectorStore(vectors: Map<string, StoredVector>): AIVectorStore {
  return {
    async upsert(id, vector, metadata) {
      vectors.set(id, { vector: [...vector], metadata })
    },
    async search(vector, options = {}) {
      const matches = Array.from(vectors.entries())
        .filter(([, item]) => !options.filter || Object.entries(options.filter).every(
          ([key, expected]) => Object.is(item.metadata?.[key], expected),
        ))
        .map(([id, item]) => ({
          id,
          score: cosineSimilarity(vector, item.vector),
          content: typeof item.metadata?.content === 'string' ? item.metadata.content : undefined,
          metadata: item.metadata,
        }))
        .filter(item => item.score >= (options.minScore ?? 0))
        .sort((left, right) => right.score - left.score)
      return matches.slice(0, options.topK ?? 10)
    },
    async remove(id) {
      vectors.delete(id)
    },
    async clear(filter) {
      if (!filter) {
        vectors.clear()
        return
      }
      for (const [id, item] of vectors) {
        if (Object.entries(filter).every(([key, expected]) => Object.is(item.metadata?.[key], expected)))
          vectors.delete(id)
      }
    },
  }
}

/** 创建进程内临时 Store Provider；`close()` 会释放全部记录 */
export function createMemoryStoreProvider(): AIStoreProvider {
  const relStores = new Map<string, Map<string, StoredValue>>()
  const vectorStores = new Map<string, Map<string, StoredVector>>()

  return {
    name: 'memory',
    createRelStore<T>(name: string): AIRelStore<T> {
      let records = relStores.get(name)
      if (!records) {
        records = new Map()
        relStores.set(name, records)
      }
      return createRelStore<T>(records)
    },
    createVectorStore(name: string): AIVectorStore {
      let vectors = vectorStores.get(name)
      if (!vectors) {
        vectors = new Map()
        vectorStores.set(name, vectors)
      }
      return createVectorStore(vectors)
    },
    initialize: () => Promise.resolve(),
    async close() {
      for (const records of relStores.values())
        records.clear()
      for (const vectors of vectorStores.values())
        vectors.clear()
      relStores.clear()
      vectorStores.clear()
    },
  }
}
