/**
 * @h-ai/ai — Memory 公共入口封装（作用域绑定 + 管理接口 + 空清空保护）
 *
 * 在 Provider 实现的 {@link MemoryCoreOperations} 基础上，封装出对外的 {@link MemoryOperations}：
 * - `scoped(binding)`：返回自动绑定 objectId / scope 的安全实例（多租户推荐入口）；
 * - `admin.clearAll({ confirm })`：唯一的全局清空入口，需显式确认；
 * - `clear`：拒绝空过滤调用，防止「忘记传条件」导致误清全局。
 * @module memory/ai-memory-facade
 */

import type { HaiResult } from '@h-ai/core'

import type { ChatMessage } from '../llm/ai-llm-types.js'
import type {
  MemoryClearAllOptions,
  MemoryClearOptions,
  MemoryCoreOperations,
  MemoryEntryInput,
  MemoryOperations,
  ScopedMemoryBinding,
  ScopedMemoryOperations,
} from './ai-memory-types.js'

import { err } from '@h-ai/core'

import { aiM } from '../ai-i18n.js'
import { HaiAIError } from '../ai-types.js'

/**
 * 创建绑定作用域的记忆实例：所有操作自动携带 objectId / scope，get/update/remove 自动归属校验。
 */
function createScopedMemory(core: MemoryCoreOperations, binding: ScopedMemoryBinding): ScopedMemoryOperations {
  const { objectId, scope } = binding
  const accessScope = { objectId, scope }

  return {
    extract: (messages: ChatMessage[], options) =>
      core.extract(messages, { ...options, objectId, scope }),
    recall: (query: string, options) =>
      core.recall(query, { ...options, objectId, scope }),
    injectMemories: (messages: ChatMessage[], options) =>
      core.injectMemories(messages, { ...options, objectId, scope }),
    add: (entry: Omit<MemoryEntryInput, 'objectId' | 'scope'>) =>
      core.add({ ...entry, objectId, scope }),
    update: (memoryId: string, updates) => core.update(memoryId, updates, accessScope),
    get: (memoryId: string) => core.get(memoryId, accessScope),
    remove: (memoryId: string) => core.remove(memoryId, accessScope),
    list: options =>
      core.list({ ...options, objectId, scope }),
    listPage: options =>
      core.listPage({ ...options, objectId, scope }),
    clear: options =>
      core.clear({ ...options, objectId, scope }),
  }
}

/**
 * 将 Provider 核心操作封装为对外的公共记忆操作接口。
 *
 * @param core - Provider 实现的核心操作
 * @returns 增加 scoped / admin 且对 clear 施加空过滤保护的公共接口
 */
export function createMemoryOperations(core: MemoryCoreOperations): MemoryOperations {
  return {
    ...core,

    /**
     * 清空记忆（空过滤保护）。
     *
     * 未传任何过滤条件（objectId / types / scope 全空）时**拒绝执行**，
     * 避免误清全局；全局清空必须显式使用 `admin.clearAll({ confirm: true })`。
     */
    async clear(options?: MemoryClearOptions): Promise<HaiResult<void>> {
      const hasFilter = Boolean(options?.objectId) || Boolean(options?.types?.length) || Boolean(options?.scope)
      if (!hasFilter) {
        return err(HaiAIError.MEMORY_STORE_FAILED, aiM('ai_memoryClearRequiresFilter'))
      }
      return core.clear(options)
    },

    scoped: (binding: ScopedMemoryBinding) => createScopedMemory(core, binding),

    admin: {
      async clearAll(options: MemoryClearAllOptions): Promise<HaiResult<void>> {
        if (options?.confirm !== true) {
          return err(HaiAIError.MEMORY_STORE_FAILED, aiM('ai_memoryClearAllUnconfirmed'))
        }
        return core.clear()
      },
    },
  }
}
