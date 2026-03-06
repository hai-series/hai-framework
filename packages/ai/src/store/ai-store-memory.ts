/**
 * @h-ai/ai — 内存存储实现
 *
 * 基于 Map 的 AIStore 实现，适用于测试和轻量场景。
 * @module ai-store-memory
 */

import type { AIStore, AIVectorStore, StoreFilter, StorePage, WhereClause, WhereOperator } from './ai-store-types.js'

/**
 * 余弦相似度
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length)
    return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

/**
 * 判断值是否为 WhereOperator 对象（含 $in / $gte / $gt / $lte / $lt）
 */
function isWhereOperator<V>(value: unknown): value is WhereOperator<V> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false
  const keys = Object.keys(value)
  return keys.length > 0 && keys.every(k => ['$in', '$gte', '$gt', '$lte', '$lt'].includes(k))
}

/**
 * 检查单个字段值是否满足 WhereOperator 中的所有条件
 */
function matchesOperator<V>(fieldValue: V, op: WhereOperator<V>): boolean {
  if (op.$in !== undefined && !op.$in.includes(fieldValue))
    return false
  if (op.$gte !== undefined && !(fieldValue >= op.$gte!))
    return false
  if (op.$gt !== undefined && !(fieldValue > op.$gt!))
    return false
  if (op.$lte !== undefined && !(fieldValue <= op.$lte!))
    return false
  if (op.$lt !== undefined && !(fieldValue < op.$lt!))
    return false
  return true
}

/**
 * 检查记录是否匹配 where 条件（支持等值匹配与操作符）
 */
function matchesWhere<T>(data: T, where: WhereClause<T>): boolean {
  for (const key of Object.keys(where) as Array<keyof T>) {
    const condition = where[key]
    if (isWhereOperator(condition)) {
      if (!matchesOperator(data[key], condition))
        return false
    }
    else {
      if (data[key] !== condition)
        return false
    }
  }
  return true
}

/**
 * 对记录数组按 filter 条件过滤 + 排序 + 限制
 */
function applyFilter<T>(items: T[], filter: StoreFilter<T>): T[] {
  let results = filter.where
    ? items.filter(item => matchesWhere(item, filter.where!))
    : [...items]

  if (filter.orderBy) {
    const { field, direction } = filter.orderBy
    results.sort((a, b) => {
      const va = a[field]
      const vb = b[field]
      if (va === vb)
        return 0
      const cmp = va < vb ? -1 : 1
      return direction === 'desc' ? -cmp : cmp
    })
  }

  if (filter.limit && filter.limit > 0) {
    results = results.slice(0, filter.limit)
  }

  return results
}

// ─── 内存 AIStore 实现 ───

/**
 * 基于 Map 的内存 AIStore 实现
 */
export class InMemoryAIStore<T> implements AIStore<T> {
  private readonly data = new Map<string, T>()

  async save(id: string, data: T): Promise<void> {
    this.data.set(id, data)
  }

  async saveMany(items: Array<{ id: string, data: T }>): Promise<void> {
    for (const { id, data } of items) {
      this.data.set(id, data)
    }
  }

  async get(id: string): Promise<T | undefined> {
    return this.data.get(id)
  }

  async query(filter: StoreFilter<T>): Promise<T[]> {
    return applyFilter(Array.from(this.data.values()), filter)
  }

  async queryPage(filter: StoreFilter<T>, page: { offset: number, limit: number }): Promise<StorePage<T>> {
    const filtered = filter.where
      ? Array.from(this.data.values()).filter(item => matchesWhere(item, filter.where!))
      : Array.from(this.data.values())

    // 排序
    if (filter.orderBy) {
      const { field, direction } = filter.orderBy
      filtered.sort((a, b) => {
        const va = a[field]
        const vb = b[field]
        if (va === vb)
          return 0
        const cmp = va < vb ? -1 : 1
        return direction === 'desc' ? -cmp : cmp
      })
    }

    const total = filtered.length
    const items = filtered.slice(page.offset, page.offset + page.limit)
    return { items, total }
  }

  async remove(id: string): Promise<boolean> {
    return this.data.delete(id)
  }

  async removeBy(filter: StoreFilter<T>): Promise<number> {
    if (!filter.where) {
      const count = this.data.size
      this.data.clear()
      return count
    }
    let count = 0
    for (const [id, item] of this.data) {
      if (matchesWhere(item, filter.where)) {
        this.data.delete(id)
        count++
      }
    }
    return count
  }

  async count(filter?: StoreFilter<T>): Promise<number> {
    if (!filter?.where)
      return this.data.size
    let count = 0
    for (const item of this.data.values()) {
      if (matchesWhere(item, filter.where))
        count++
    }
    return count
  }

  async clear(filter?: StoreFilter<T>): Promise<void> {
    if (!filter?.where) {
      this.data.clear()
      return
    }
    for (const [id, item] of this.data) {
      if (matchesWhere(item, filter.where))
        this.data.delete(id)
    }
  }
}

// ─── 内存 VectorStore 实现 ───

interface VectorEntry {
  id: string
  vector: number[]
  metadata?: Record<string, unknown>
}

/**
 * 基于 Map + 余弦相似度的内存向量存储
 */
export class InMemoryVectorStore implements AIVectorStore {
  private readonly entries = new Map<string, VectorEntry>()

  async upsert(id: string, vector: number[], metadata?: Record<string, unknown>): Promise<void> {
    this.entries.set(id, { id, vector, metadata })
  }

  async search(vector: number[], options?: { topK?: number, filter?: Record<string, unknown> }): Promise<Array<{ id: string, score: number, metadata?: Record<string, unknown> }>> {
    const topK = options?.topK ?? 10
    const candidates: Array<{ id: string, score: number, metadata?: Record<string, unknown> }> = []

    for (const entry of this.entries.values()) {
      // 元数据过滤
      if (options?.filter) {
        let match = true
        for (const [key, val] of Object.entries(options.filter)) {
          if (entry.metadata?.[key] !== val) {
            match = false
            break
          }
        }
        if (!match)
          continue
      }

      const score = cosineSimilarity(vector, entry.vector)
      candidates.push({ id: entry.id, score, metadata: entry.metadata })
    }

    candidates.sort((a, b) => b.score - a.score)
    return candidates.slice(0, topK)
  }

  async remove(id: string): Promise<void> {
    this.entries.delete(id)
  }

  async removeBy(filter: Record<string, unknown>): Promise<number> {
    let count = 0
    for (const [id, entry] of this.entries) {
      let match = true
      for (const [key, val] of Object.entries(filter)) {
        if (entry.metadata?.[key] !== val) {
          match = false
          break
        }
      }
      if (match) {
        this.entries.delete(id)
        count++
      }
    }
    return count
  }

  async clear(filter?: Record<string, unknown>): Promise<void> {
    if (!filter) {
      this.entries.clear()
      return
    }
    await this.removeBy(filter)
  }
}
