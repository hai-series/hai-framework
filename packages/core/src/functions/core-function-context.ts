/** 请求关联上下文：Node 入口安装异步隔离，浏览器仅支持同步作用域。 */
import type { AsyncLocalStorage } from 'node:async_hooks'
import type { RequestContext } from '../core-types.js'

let storage: AsyncLocalStorage<Readonly<RequestContext>> | undefined
let synchronousContext: Readonly<RequestContext> = Object.freeze({})

/**
 * 模块内部：仅由 Node 条件入口安装，不进入公共 barrel。
 * @example 模块内部上下文
 * ```ts
 * function install(storage: Parameters<typeof installRequestContext>[0]) { installRequestContext(storage) }
 * ```
 */
export function installRequestContext(value: AsyncLocalStorage<Readonly<RequestContext>>): void {
  storage = value
}

/**
 * 模块内部实现，经 core.context 暴露。
 * @example 模块内部上下文
 * ```ts
 * const id = requestContext.run({ requestId: 'request-1' }, () => requestContext.get().requestId)
 * ```
 */
export const requestContext = {
  get(): Readonly<RequestContext> {
    return storage?.getStore() ?? synchronousContext
  },
  run<T>(value: RequestContext, operation: () => T): T {
    const previousValue = requestContext.get()
    // 仅传播关联字段，不能把调用方的权限列表或其它身份对象顺带写入日志。
    const merged = Object.freeze({
      requestId: Object.hasOwn(value, 'requestId') ? value.requestId : previousValue.requestId,
      traceId: value.traceId ?? (Object.hasOwn(value, 'requestId') ? value.requestId : previousValue.traceId),
      scopeId: Object.hasOwn(value, 'scopeId') ? value.scopeId : previousValue.scopeId,
      userId: Object.hasOwn(value, 'userId') ? value.userId : previousValue.userId,
      jobId: Object.hasOwn(value, 'jobId') ? value.jobId : previousValue.jobId,
      suppressLogObservers: Object.hasOwn(value, 'suppressLogObservers') ? value.suppressLogObservers : previousValue.suppressLogObservers,
    })
    if (storage)
      return storage.run(merged, operation)
    const previous = synchronousContext
    synchronousContext = merged
    try {
      return operation()
    }
    finally {
      synchronousContext = previous
    }
  },
}
