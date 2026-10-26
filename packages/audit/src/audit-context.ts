/** 审计身份仅在当前异步请求中传播，不进入全局授权状态或通用日志上下文。 */
import type { AuditContext } from './audit-types.js'
import { AsyncLocalStorage } from 'node:async_hooks'

const storage = new AsyncLocalStorage<Readonly<AuditContext>>()

/**
 * 模块内部读取上下文；无请求时返回空对象。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const requestId = getAuditContext().requestId
 * ```
 */
export function getAuditContext(): Readonly<AuditContext> {
  return storage.getStore() ?? {}
}

/**
 * 复制身份及角色数组，防止调用者后续修改污染事件快照。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const id = withAuditContext({ requestId: 'request-1' }, () => getAuditContext().requestId)
 * ```
 */
export function withAuditContext<T>(context: AuditContext, operation: () => T): T {
  const previous = getAuditContext()
  const actor = Object.hasOwn(context, 'actor') ? context.actor : previous.actor
  const snapshot = actor ? { ...actor, ...(actor.roles ? { roles: [...actor.roles] } : {}) } : actor
  return storage.run({ ...previous, ...context, actor: snapshot }, operation)
}
