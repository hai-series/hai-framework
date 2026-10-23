/**
 * 共享上下文聚合状态。所有业务写入必须通过版本 CAS，租约仅用于发现失联生成。
 * @module ai-context-state
 */
import type { HaiErrorDef } from '@h-ai/core'
import type { ChatMessage } from '../llm/ai-llm-types.js'
import type { AIRelStore, InteractionScope } from '../store/ai-store-types.js'
import type { SummaryResult } from '../summary/ai-summary-types.js'
import type { ConversationTurn } from './ai-context-types.js'
import { HaiAIError } from '../ai-types.js'
import { sessionStoreKey } from '../store/ai-store-key.js'

/**
 * 生成所有权；pending 没有超时，必须由业务确认实际表达内容。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const generation: ContextGeneration = { epoch: crypto.randomUUID(), id: crypto.randomUUID(), owner: crypto.randomUUID(), phase: 'generating', expiresAt: 30_000, userMessage: '你好' }
 * const owner = generation.owner
 * ```
 */
export interface ContextGeneration {
  /** 获取许可时的上下文纪元，reset 后旧 producer 不可复用。 */
  epoch: string
  /** 全局唯一轮次 ID。 */
  id: string
  /** 每次获取生成许可的不可复用 owner。 */
  owner: string
  /** generating 需要租约；pending 可由任意节点提交。 */
  phase: 'generating' | 'pending'
  /** 存储端时钟的截止时间，Unix 毫秒。 */
  expiresAt: number
  /** 与实际回复配对的用户输入。 */
  userMessage: string
}

/**
 * 一条记录原子保存消息、摘要、轮次和待提交状态，避免恢复时跨记录拼接。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const state: PersistedContextState = { scope: { objectId: 'user-1', sessionId: 'session-1' }, messages: [], summaries: [], turns: [], epoch: crypto.randomUUID(), updatedAt: 0 }
 * const scope = structuredClone(state.scope)
 * ```
 */
export interface PersistedContextState {
  /** 作用域副本用于批量目录过滤，不从客户端消息推导身份。 */
  scope: InteractionScope
  /** 已提交消息。 */
  messages: ChatMessage[]
  /** 历次压缩摘要。 */
  summaries: SummaryResult[]
  /** 生成与实际提交记录。 */
  turns: ConversationTurn[]
  /** reset 更换纪元，旧 producer 无法回写。 */
  epoch: string
  /** 当前生成或待提交轮次。 */
  active?: ContextGeneration
  /** 永久删除墓碑；相同 scope 不再复用。 */
  deleted?: boolean
  /** 存储端更新时间，Unix 毫秒。 */
  updatedAt: number
}

/**
 * 内部流程异常由公开 HaiResult 边界转换；流式接口继续以异常终止。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const failure = new ContextStateError(HaiAIError.CONTEXT_BUSY, 'Context busy')
 * const definition = failure.definition
 * ```
 */
export class ContextStateError extends Error {
  readonly code: HaiErrorDef['code']

  constructor(readonly definition: HaiErrorDef, message: string) {
    super(message)
    this.code = definition.code
  }
}

/**
 * 一次候选变更；期限在最终 SQL 中检查。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const readonlyResult: StateChange<number> = { value: 2, write: false }
 * const committedCount = readonlyResult.value
 * ```
 */
interface StateChange<T> {
  /** CAS 成功后交给调用方的业务结果。 */
  value: T
  /** 最终写入的存储端截止时间。 */
  notAfter?: number
  /** false 表示幂等只读结果，不更换版本。 */
  write?: false
}

/**
 * 创建作用域内共享状态访问器；冲突后重新读取并重算，绝不保存旧快照。
 * @param store - 支持原子版本及存储端时钟的持久化 Store
 * @param scope - 明确的主体与会话
 * @param initial - 仅在记录不存在时使用的初始状态
 * @param receive - 成功读取/提交后更新管理器的只读快照
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * async function readScope(store: AIRelStore<PersistedContextState>, scope: InteractionScope) {
 *   const initial: PersistedContextState = { scope, messages: [], summaries: [], turns: [], epoch: crypto.randomUUID(), updatedAt: 0 }
 *   let snapshot = structuredClone(initial)
 *   const access = createContextStateAccess(store, scope, initial, current => { snapshot = current })
 *   await access.read()
 *   return snapshot
 * }
 * ```
 */
export function createContextStateAccess(
  store: AIRelStore<PersistedContextState>,
  scope: InteractionScope,
  initial: PersistedContextState,
  receive: (state: PersistedContextState) => void,
) {
  const key = sessionStoreKey(scope)
  return {
    async read(): Promise<PersistedContextState> {
      const record = await store.readVersioned(key)
      const state = record?.data ?? structuredClone(initial)
      receive(structuredClone(state))
      return state
    },
    async mutate<T>(
      change: (state: PersistedContextState, now: number) => Promise<StateChange<T>> | StateChange<T>,
      allowDeleted = false,
    ): Promise<T> {
      for (let attempt = 0; attempt < 64; attempt++) {
        const record = await store.readVersioned(key)
        const state = record?.data ?? structuredClone(initial)
        if (state.deleted && !allowDeleted)
          throw new ContextStateError(HaiAIError.SESSION_FAILED, 'Context has been deleted')
        const now = await store.currentTime()
        const result = await change(state, now)
        if (result.write === false) {
          receive(structuredClone(state))
          return result.value
        }
        state.updatedAt = now
        const version = await store.compareAndSwap(key, {
          expectedVersion: record?.version,
          data: state,
          scope,
          notAfter: result.notAfter,
        })
        if (version !== undefined) {
          receive(structuredClone(state))
          return result.value
        }
      }
      throw new ContextStateError(HaiAIError.CONTEXT_BUSY, 'Context changed too frequently')
    },
  }
}
