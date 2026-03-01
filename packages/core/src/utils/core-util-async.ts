/**
 * @h-ai/core — 异步操作工具
 * @module core-util-async
 */

import { i18n } from '../i18n/core-i18n-utils.js'

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
function delay(ms: number): Promise<void> {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

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
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  // 使用 Promise.race + 定时器实现超时控制
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(i18n.coreM('core_errorTimeout'))), ms))
  return Promise.race([promise, timeout])
}

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
async function retry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number, delay?: number } = {},
): Promise<T> {
  const { maxRetries = 3, delay: retryDelay = 1000 } = options
  let lastError: unknown
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    }
    catch (e) {
      lastError = e
      if (i < maxRetries - 1)
        await delay(retryDelay)
    }
  }
  throw lastError
}

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
async function parallel<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency = 5,
): Promise<R[]> {
  const results: R[] = []
  let index = 0

  async function worker(): Promise<void> {
    while (index < items.length) {
      const currentIndex = index++
      results[currentIndex] = await fn(items[currentIndex], currentIndex)
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  )
  await Promise.all(workers)
  return results
}

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
async function serial<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i++) {
    results.push(await fn(items[i], i))
  }
  return results
}

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
function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  ms: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  return (...args: Parameters<T>) => {
    if (timer)
      clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}

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
function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  ms: number,
): (...args: Parameters<T>) => void {
  let lastTime = 0
  return (...args: Parameters<T>) => {
    const now = Date.now()
    if (now - lastTime >= ms) {
      lastTime = now
      fn(...args)
    }
  }
}

/**
 * 异步操作工具对象。
 *
 * @example
 * ```ts
 * await async.delay(100)
 * ```
 */
export const async = {
  delay,
  withTimeout,
  retry,
  parallel,
  serial,
  debounce,
  throttle,
}
