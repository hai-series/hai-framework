/**
 * @h-ai/ai — 会话存储键
 *
 * 提供 LLM / Context / SessionStore 共用的复合存储键构造，确保不同交互主体
 * 使用相同 sessionId 时不会在会话目录（SessionInfo）与上下文正文上互相覆盖。
 * @module store/ai-store-key
 */

import type { InteractionScope } from './ai-store-types.js'

/**
 * 构造会话存储的复合主键
 *
 * 用 JSON 数组序列化 `[objectId, sessionId]`，避免朴素拼接 `${objectId}:${sessionId}`
 * 在 id 本身含分隔符时产生碰撞（如 `a` + `b:c` 与 `a:b` + `c` 得到同一键），
 * 也避免不同主体相同 sessionId 因裸 sessionId 作主键而互相覆盖。
 *
 * LLM、Context 与 SessionStore 必须共用此实现。
 *
 * @param scope - 交互作用域（主体 ID + 会话 ID）
 * @returns 复合存储键
 */
export function sessionStoreKey(scope: InteractionScope): string {
  return JSON.stringify([scope.objectId, scope.sessionId])
}
