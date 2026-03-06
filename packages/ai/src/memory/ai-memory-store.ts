/**
 * @h-ai/ai — Memory 记忆存储
 *
 * 提供 MemoryStore 内存实现，管理记忆条目的增删查。
 * @module ai-memory-store
 */

import type { MemoryType } from '../ai-config.js'
import type { MemoryClearOptions, MemoryEntry, MemoryEntryInput, MemoryListOptions } from './ai-memory-types.js'

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

/**
 * 内存记忆存储
 *
 * 基于 Map 的记忆存储实现，适用于单进程运行时场景。
 */
export class InMemoryStore {
  private readonly entries = new Map<string, MemoryEntry>()
  private readonly maxEntries: number

  constructor(maxEntries: number) {
    this.maxEntries = maxEntries
  }

  /**
   * 添加一条记忆
   *
   * 超出 maxEntries 时淘汰最低重要性 + 最早创建的条目。
   */
  add(input: MemoryEntryInput, vector?: number[]): MemoryEntry {
    // 淘汰策略：超限时移除优先级最低的条目
    if (this.entries.size >= this.maxEntries) {
      this.evict()
    }

    const now = Date.now()
    const entry: MemoryEntry = {
      id: generateId(),
      content: input.content,
      type: input.type,
      importance: input.importance ?? 0.5,
      source: input.source,
      metadata: input.metadata,
      vector,
      createdAt: now,
      lastAccessedAt: now,
      accessCount: 0,
    }

    this.entries.set(entry.id, entry)
    return entry
  }

  /**
   * 批量添加记忆
   */
  addMany(inputs: Array<{ input: MemoryEntryInput, vector?: number[] }>): MemoryEntry[] {
    return inputs.map(({ input, vector }) => this.add(input, vector))
  }

  /**
   * 获取指定记忆（同时更新访问统计）
   */
  get(id: string): MemoryEntry | undefined {
    const entry = this.entries.get(id)
    if (entry) {
      entry.lastAccessedAt = Date.now()
      entry.accessCount++
    }
    return entry
  }

  /**
   * 删除指定记忆
   */
  remove(id: string): boolean {
    return this.entries.delete(id)
  }

  /**
   * 获取所有记忆（支持过滤）
   */
  list(options?: MemoryListOptions): MemoryEntry[] {
    let results = Array.from(this.entries.values())

    if (options?.types && options.types.length > 0) {
      const typeSet = new Set<MemoryType>(options.types)
      results = results.filter(e => typeSet.has(e.type))
    }

    if (options?.source) {
      results = results.filter(e => e.source === options.source)
    }

    // 按创建时间降序
    results.sort((a, b) => b.createdAt - a.createdAt)

    if (options?.limit && options.limit > 0) {
      results = results.slice(0, options.limit)
    }

    return results
  }

  /**
   * 清空记忆（支持过滤）
   */
  clear(options?: MemoryClearOptions): void {
    if (!options?.types && !options?.source) {
      this.entries.clear()
      return
    }

    const typeSet = options.types ? new Set<MemoryType>(options.types) : null

    for (const [id, entry] of this.entries) {
      const matchType = !typeSet || typeSet.has(entry.type)
      const matchSource = !options.source || entry.source === options.source
      if (matchType && matchSource) {
        this.entries.delete(id)
      }
    }
  }

  /**
   * 获取所有带向量的记忆条目
   */
  getWithVectors(): Array<MemoryEntry & { vector: number[] }> {
    const results: Array<MemoryEntry & { vector: number[] }> = []
    for (const entry of this.entries.values()) {
      if (entry.vector) {
        results.push(entry as MemoryEntry & { vector: number[] })
      }
    }
    return results
  }

  /** 当前记忆数量 */
  get size(): number {
    return this.entries.size
  }

  /**
   * 淘汰低优先级条目
   *
   * 规则：按 (importance * 0.7 + recency * 0.3) 排序，移除最低的。
   */
  private evict(): void {
    if (this.entries.size === 0)
      return

    const now = Date.now()
    const maxAge = 7 * 24 * 60 * 60 * 1000 // 7 天作为标准化基准

    let lowestScore = Infinity
    let lowestId: string | null = null

    for (const [id, entry] of this.entries) {
      const age = now - entry.createdAt
      const recency = Math.max(0, 1 - age / maxAge)
      const score = entry.importance * 0.7 + recency * 0.3
      if (score < lowestScore) {
        lowestScore = score
        lowestId = id
      }
    }

    if (lowestId) {
      this.entries.delete(lowestId)
    }
  }
}
