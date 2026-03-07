/**
 * @h-ai/ai — Store 工厂
 *
 * 根据配置创建 AIStore 和 AIVectorStore 实例，自动选择内存或持久化实现。
 * 工厂函数为同步调用，persistent 模式通过懒加载代理延迟解析外部依赖。
 * @module ai-store-factory
 */

import type { AIStore, AIStoreMode, AIVectorStore, ReldbJsonOps, ReldbSql, VecdbClient } from './ai-store-types.js'

import { core } from '@h-ai/core'

import { ReldbAIStore, VecdbAIVectorStore } from './ai-store-db.js'
import { InMemoryAIStore, InMemoryVectorStore } from './ai-store-memory.js'

const logger = core.logger.child({ module: 'ai', scope: 'store' })

// ─── reldb / vecdb 动态加载 ───

async function loadReldbSql(): Promise<{ sql: ReldbSql, jsonOps: ReldbJsonOps } | null> {
  try {
    const { reldb } = await import('@h-ai/reldb')
    return reldb.isInitialized ? { sql: reldb.sql as unknown as ReldbSql, jsonOps: reldb.json as unknown as ReldbJsonOps } : null
  }
  catch {
    return null
  }
}

async function loadVecdb(): Promise<VecdbClient | null> {
  try {
    const { vecdb } = await import('@h-ai/vecdb')
    return vecdb.isInitialized ? vecdb as unknown as VecdbClient : null
  }
  catch {
    return null
  }
}

// ─── 懒加载代理（persistent 模式在首次调用时解析外部依赖） ───

/**
 * 创建懒加载 AIStore 代理
 *
 * 首次方法调用时尝试加载 reldb，成功则使用 ReldbAIStore，失败则降级为 InMemoryAIStore。
 */
function createLazyReldbStore<T>(table: string): AIStore<T> {
  let delegate: AIStore<T> | null = null

  async function resolve(): Promise<AIStore<T>> {
    if (!delegate) {
      const reldb = await loadReldbSql()
      if (reldb) {
        logger.debug('Lazy-resolved persistent AIStore', { table })
        delegate = new ReldbAIStore<T>(reldb.sql, table, reldb.jsonOps)
      }
      else {
        logger.warn('reldb not available, falling back to memory store', { table })
        delegate = new InMemoryAIStore<T>()
      }
    }
    return delegate
  }

  return {
    save: async (id, data) => (await resolve()).save(id, data),
    saveMany: async items => (await resolve()).saveMany(items),
    get: async id => (await resolve()).get(id),
    query: async filter => (await resolve()).query(filter),
    queryPage: async (filter, page) => (await resolve()).queryPage(filter, page),
    remove: async id => (await resolve()).remove(id),
    removeBy: async filter => (await resolve()).removeBy(filter),
    count: async filter => (await resolve()).count(filter),
    clear: async filter => (await resolve()).clear(filter),
  }
}

/**
 * 创建懒加载 AIVectorStore 代理
 *
 * 首次方法调用时尝试加载 vecdb，成功则使用 VecdbAIVectorStore，失败则降级为 InMemoryVectorStore。
 */
function createLazyVecdbStore(collection: string): AIVectorStore {
  let delegate: AIVectorStore | null = null

  async function resolve(): Promise<AIVectorStore> {
    if (!delegate) {
      const client = await loadVecdb()
      if (client) {
        logger.debug('Lazy-resolved persistent AIVectorStore', { collection })
        delegate = new VecdbAIVectorStore(client, collection)
      }
      else {
        logger.warn('vecdb not available, falling back to memory vector store', { collection })
        delegate = new InMemoryVectorStore()
      }
    }
    return delegate
  }

  return {
    upsert: async (id, vector, metadata) => (await resolve()).upsert(id, vector, metadata),
    search: async (vector, options) => (await resolve()).search(vector, options),
    remove: async id => (await resolve()).remove(id),
    removeBy: async filter => (await resolve()).removeBy(filter),
    clear: async filter => (await resolve()).clear(filter),
  }
}

// ─── 工厂函数 ───

/**
 * 创建 AIStore 实例（同步）
 *
 * memory 模式直接返回 InMemoryAIStore；
 * persistent 模式返回懒加载代理，首次调用时解析 `@h-ai/reldb`，不可用则降级为 memory。
 *
 * @param table - 表名（persistent 模式下的 reldb 表名）
 * @param mode - 存储模式
 * @returns AIStore 实例
 */
export function createAIStore<T>(table: string, mode: AIStoreMode): AIStore<T> {
  if (mode === 'persistent') {
    return createLazyReldbStore<T>(table)
  }
  logger.debug('Created in-memory AIStore', { table })
  return new InMemoryAIStore<T>()
}

/**
 * 创建 AIVectorStore 实例（同步）
 *
 * memory 模式直接返回 InMemoryVectorStore；
 * persistent 模式返回懒加载代理，首次调用时解析 `@h-ai/vecdb`，不可用则降级为 memory。
 *
 * @param collection - 集合名（vecdb 集合名）
 * @param mode - 存储模式
 * @returns AIVectorStore 实例
 */
export function createAIVectorStore(collection: string, mode: AIStoreMode): AIVectorStore {
  if (mode === 'persistent') {
    return createLazyVecdbStore(collection)
  }
  logger.debug('Created in-memory AIVectorStore', { collection })
  return new InMemoryVectorStore()
}
