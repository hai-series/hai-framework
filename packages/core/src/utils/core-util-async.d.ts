/**
 * =============================================================================
 * @h-ai/core - 异步操作工具
 * =============================================================================
 */
/**
 * 延迟执行。
 *
 * @param ms - 延迟毫秒数
 * @returns 延迟完成后的 Promise
 *
 * @example
 * ```ts
 * await async.delay(1000)
 * ```
 */
declare function delay(ms: number): Promise<void>
/**
 * 添加超时限制。
 *
 * @param promise - 目标 Promise
 * @param ms - 超时时间（毫秒）
 * @returns 原 Promise 的结果
 * @throws 超时将抛出错误
 *
 * @example
 * ```ts
 * await async.withTimeout(fetch('/api'), 5000)
 * ```
 */
declare function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T>
/**
 * 重试操作。
 *
 * @param fn - 待重试函数
 * @param options - 重试配置
 * @param options.maxRetries - 最大重试次数
 * @param options.delay - 重试间隔（毫秒）
 * @returns 成功的结果
 * @throws 重试耗尽后抛出最后一次错误
 *
 * @example
 * ```ts
 * await async.retry(() => fetch('/api'), { maxRetries: 3, delay: 500 })
 * ```
 */
declare function retry<T>(fn: () => Promise<T>, options?: {
  maxRetries?: number
  delay?: number
}): Promise<T>
/**
 * 并行执行，限制并发数。
 *
 * @param items - 输入列表
 * @param fn - 处理函数
 * @param concurrency - 最大并发数
 * @returns 处理结果列表
 * @remarks 结果顺序与输入顺序一致。
 *
 * @example
 * ```ts
 * await async.parallel([1, 2, 3], async n => n * 2, 2)
 * ```
 */
declare function parallel<T, R>(items: T[], fn: (item: T, index: number) => Promise<R>, concurrency?: number): Promise<R[]>
/**
 * 串行执行。
 *
 * @param items - 输入列表
 * @param fn - 处理函数
 * @returns 处理结果列表
 *
 * @example
 * ```ts
 * await async.serial([1, 2], async n => n * 2)
 * ```
 */
declare function serial<T, R>(items: T[], fn: (item: T, index: number) => Promise<R>): Promise<R[]>
/**
 * 防抖。
 *
 * @param fn - 目标函数
 * @param ms - 延迟毫秒数
 * @returns 防抖后的函数
 * @remarks 只会在最后一次调用后执行。
 *
 * @example
 * ```ts
 * const onInput = async.debounce(() => {}, 300)
 * ```
 */
declare function debounce<T extends (...args: unknown[]) => unknown>(fn: T, ms: number): (...args: Parameters<T>) => void
/**
 * 节流。
 *
 * @param fn - 目标函数
 * @param ms - 间隔毫秒数
 * @returns 节流后的函数
 * @remarks 在时间窗口内最多触发一次。
 *
 * @example
 * ```ts
 * const onScroll = async.throttle(() => {}, 200)
 * ```
 */
declare function throttle<T extends (...args: unknown[]) => unknown>(fn: T, ms: number): (...args: Parameters<T>) => void
/**
 * 异步操作工具对象。
 *
 * @example
 * ```ts
 * await async.delay(100)
 * ```
 */
export declare const async: {
  delay: typeof delay
  withTimeout: typeof withTimeout
  retry: typeof retry
  parallel: typeof parallel
  serial: typeof serial
  debounce: typeof debounce
  throttle: typeof throttle
}
export {}
// # sourceMappingURL=core-util-async.d.ts.map
