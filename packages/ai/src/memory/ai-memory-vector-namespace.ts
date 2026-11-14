import type { AIRelStore, AIVectorStore } from '../store/ai-store-types.js'
import type { StoredMemory } from './ai-memory-vector-sync.js'
import { randomUUID } from 'node:crypto'
import { core } from '@h-ai/core'
import { aiM } from '../ai-i18n.js'

/**
 * 关系库的原生记忆向量归属，以及重建索引的断点。
 * @example
 * ```ts
 * import type { MemoryVectorNamespace } from './ai-memory-vector-namespace.js'
 * const state: MemoryVectorNamespace = { namespace: 'shop', owner: 'a'.repeat(32), updatedAt: 0 }
 * ```
 */
export interface MemoryVectorNamespace {
  namespace: string
  owner: string
  cursor?: string
  migrated?: boolean
  updatedAt: number
}

const logger = core.logger.child({ module: 'ai', scope: 'memory-vector-namespace' })
const bindingId = 'namespace'
const leaseMs = 90_000
const tickMs = 1000
const pagesPerTick = 8
const pageSize = 64

/**
 * 确定物理集合名。新节点只能采用已持久化的归属，不会使用旧的共享集合。
 * @example
 * ```ts
 * import type { AIRelStore } from '../store/ai-store-types.js'
 * import { bindMemoryVectorNamespace, type MemoryVectorNamespace } from './ai-memory-vector-namespace.js'
 * function collection(store: AIRelStore<MemoryVectorNamespace>) {
 *   return bindMemoryVectorNamespace(store, 'shop')
 * }
 * ```
 */
export async function bindMemoryVectorNamespace(state: AIRelStore<MemoryVectorNamespace>, namespace: string): Promise<string> {
  const readBinding = async (store: AIRelStore<MemoryVectorNamespace>) => {
    let current = (await store.readVersioned(bindingId))?.data
    if (!current) {
      const proposed = {
        namespace,
        owner: randomUUID().replaceAll('-', ''),
        updatedAt: 0,
      }
      const created = await store.compareAndSwap(bindingId, { expectedVersion: undefined, data: proposed })
      current = created
        ? proposed
        : (await store.readVersioned(bindingId))?.data
    }
    if (!current || current.namespace !== namespace || !/^[a-f0-9]{32}$/.test(current.owner))
      throw new Error(aiM('ai_memoryVectorNamespaceMismatch'))
    return `hai_m_${namespace}_${current.owner}`
  }
  return state.withWriteLock
    ? state.withWriteLock(readBinding)
    : readBinding(state)
}

/**
 * 从关系数据重建索引，无需查询混合归属的旧集合或重新调用 Embedding。
 * @example
 * ```ts
 * import { createMemoryVectorRebuild } from './ai-memory-vector-namespace.js'
 * function start(worker: ReturnType<typeof createMemoryVectorRebuild>) { worker?.start() }
 * ```
 */
export function createMemoryVectorRebuild(memory: AIRelStore<StoredMemory>, state: AIRelStore<MemoryVectorNamespace>, vectors: AIVectorStore) {
  const readPage = memory.readMemoryVectorPage?.bind(memory)
  if (!readPage)
    return undefined

  const lockedWrite = state.withWriteLock?.bind(state)
  const write = lockedWrite ?? (<R>(operation: (store: AIRelStore<MemoryVectorNamespace>) => Promise<R>) => operation(state))
  let timer: ReturnType<typeof setInterval> | undefined
  let active: Promise<void> | undefined
  let done = false
  let nextCheck = 0

  const rebuildPage = async () => {
    const snapshot = await state.readVersioned(bindingId)
    if (!snapshot)
      throw new Error('Missing native memory vector binding')
    if (snapshot.data.migrated) {
      done = true
      clearInterval(timer)
      timer = undefined
      return false
    }
    const now = await state.currentTime()
    if (snapshot.data.updatedAt > now) {
      nextCheck = performance.now() + Math.min(5000, snapshot.data.updatedAt - now)
      return false
    }

    const deadline = now + leaseMs
    const lease = await write(checkpoint => checkpoint.compareAndSwap(bindingId, {
      expectedVersion: snapshot.version,
      data: { ...snapshot.data, updatedAt: deadline },
    }))
    if (!lease)
      return false

    let progress = snapshot.data
    try {
      const rows = await readPage(progress.cursor ?? '', pageSize)
      const batch = rows.flatMap(entry => entry.vector
        ? [
            {
              id: entry.vectorId ?? entry.id,
              vector: entry.vector,
              metadata: { objectId: entry.objectId, type: entry.type },
            },
          ]
        : [])
      if (batch.length) {
        if (vectors.upsertMany) {
          await vectors.upsertMany(batch)
        }
        else {
          for (const { id, vector, metadata } of batch)
            await vectors.upsert(id, vector, metadata)
        }
      }
      progress = rows.length < pageSize
        ? {
            ...progress,
            cursor: undefined,
            migrated: true,
            updatedAt: 0,
          }
        : { ...progress, cursor: rows.at(-1)!.id, updatedAt: 0 }
    }
    catch {
      nextCheck = performance.now() + 2000
      logger.warn('Memory vector rebuild page will retry')
      progress = { ...progress, updatedAt: await state.currentTime() + 2000 }
    }

    const version = await write(checkpoint => checkpoint.compareAndSwap(bindingId, {
      expectedVersion: lease,
      data: progress,
      notAfter: deadline,
    }))
    return Boolean(version && !progress.updatedAt)
  }

  function kick() {
    if (done || active || performance.now() < nextCheck)
      return
    active = (async () => {
      for (let page = 0; page < pagesPerTick; page++) {
        if (!timer || !await rebuildPage())
          break
      }
    })().catch(() => {
      nextCheck = performance.now() + 2000
      logger.warn('Memory vector namespace checkpoint unavailable')
    }).finally(() => { active = undefined })
  }

  return {
    start() {
      if (done || timer)
        return
      timer = setInterval(kick, tickMs)
      timer.unref()
      kick()
    },
    async close() {
      clearInterval(timer)
      timer = undefined
      await active
    },
  }
}
