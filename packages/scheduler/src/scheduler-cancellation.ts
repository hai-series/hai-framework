/**
 * 等待可协作取消的操作；取消只终止等待，operation 必须消费 signal 才能停止外部活动。
 *
 * @param operation - 要启动的同步或异步操作
 * @param signal - 已取消时不启动 operation；进行中取消则拒绝等待
 * @returns operation 的结果
 * @throws signal.reason 或 operation 的异常；不能据此推断外部操作未提交。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const controller = new AbortController()
 * try {
 *   const response = await waitWithSignal(
 *     () => fetch('https://example.com/health', { signal: controller.signal }),
 *     controller.signal,
 *   )
 *   const status = response.status
 * } catch (error) {
 *   // 取消或 operation 异常会 reject；宿主应核对已经开始的外部效果。
 * }
 * ```
 */
export async function waitWithSignal<T>(operation: () => T | Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()
  return new Promise<T>((resolve, reject) => {
    const aborted = () => reject(signal.reason)
    signal.addEventListener('abort', aborted, { once: true })
    Promise.resolve().then(operation).then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', aborted)
    })
  })
}
