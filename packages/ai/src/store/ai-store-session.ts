/** 共享会话目录的版本化更新，供 LLM 记录与 Context 共用。 @module ai-store-session */
import type { AIRelStore, InteractionScope, SessionInfo } from './ai-store-types.js'
import { sessionStoreKey } from './ai-store-key.js'

/**
 * 条件更新目录；冲突后重读，保留并发重命名与永久删除标记。
 * @param store - 会话目录 Store
 * @param scope - 主体和会话
 * @param change - 由最新记录计算新值；undefined 表示不写入
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * async function touch(store: AIRelStore<SessionInfo>, scope: InteractionScope) {
 *   await updateSessionInfo(store, scope, (current, now) => {
 *     if (current?.deleted) return undefined
 *     return { ...current, ...scope, createdAt: current?.createdAt ?? now, updatedAt: now }
 *   })
 * }
 * ```
 */
export async function updateSessionInfo(
  store: AIRelStore<SessionInfo>,
  scope: InteractionScope,
  change: (existing: SessionInfo | undefined, now: number) => SessionInfo | undefined,
): Promise<void> {
  const index = { objectId: scope.objectId, sessionId: scope.sessionId }
  const key = sessionStoreKey(index)
  for (let attempt = 0; attempt < 64; attempt++) {
    const current = await store.readVersioned(key)
    const next = change(current?.data, await store.currentTime())
    if (!next)
      return
    if (await store.compareAndSwap(key, { expectedVersion: current?.version, data: next, scope: index }) !== undefined)
      return
  }
  throw new Error('Session directory changed too frequently')
}
