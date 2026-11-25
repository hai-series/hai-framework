import type { AIRelStore } from '../store/ai-store-types.js'
import { randomUUID } from 'node:crypto'
import { aiM } from '../ai-i18n.js'

/**
 * 关系库与原生记忆专用向量集合的持久归属。
 * @example
 * ```ts
 * import type { MemoryVectorNamespace } from './ai-memory-vector-namespace.js'
 * const state: MemoryVectorNamespace = { namespace: 'shop', owner: 'a'.repeat(32) }
 * ```
 */
export interface MemoryVectorNamespace {
  namespace: string
  owner: string
}

const bindingId = 'namespace'

/**
 * 确定物理集合名。共享关系库的所有节点复用同一份持久归属。
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
