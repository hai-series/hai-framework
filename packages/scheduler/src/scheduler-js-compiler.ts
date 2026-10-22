/**
 * @h-ai/scheduler — JS 任务编译器
 *
 * 将 JS 函数字符串编译为可执行函数，并基于源码缓存编译结果。
 * ⚠️ 仅用于受信任的服务端代码字符串；当前实现不是安全沙箱。
 * @module scheduler-js-compiler
 */

import type { HaiResult } from '@h-ai/core'

import type { JsTaskConfig, JsTaskHandler } from './scheduler-types.js'
import { createHash } from 'node:crypto'
import { Script } from 'node:vm'
import { Worker } from 'node:worker_threads'
import { err, ok } from '@h-ai/core'

import { schedulerM } from './scheduler-i18n.js'
import { HaiSchedulerError } from './scheduler-types.js'

/** 已编译 JS 处理器缓存 */
const compiledHandlerCache = new Map<string, JsTaskHandler>()

function createCacheKey(config: JsTaskConfig): string {
  // 缓存键包含 timeout，确保相同代码不同超时语义不会复用同一处理器
  const keySource = `${config.code}:${config.timeout ?? 0}`
  return createHash('sha256').update(keySource).digest('hex')
}

/**
 * 清除本地编译闭包缓存；不终止已经启动的工作线程。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * // 调度器关闭并排空工作线程后，释放只含编译闭包的本地缓存。
 * clearJsTaskHandlerCache()
 * ```
 */
export function clearJsTaskHandlerCache(): void {
  compiledHandlerCache.clear()
}

/**
 * 校验受信任的 JS 函数表达式并返回独立工作线程执行器；不是安全沙箱。
 *
 * @param config - 受信任源码和含线程启动的总期限
 * @returns 编译结果；返回的 handler 在运行失败或取消时可 reject。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const compiled = compileJsTaskHandler({ kind: 'js', code: '(context) => ({ taskId: context.taskId })', timeout: 1000 })
 * if (!compiled.success) return compiled
 * const task: Parameters<JsTaskHandler>[0]['task'] = { id: 'daily-report', name: '每日报表', cron: '0 2 * * *', timezone: 'UTC' }
 * const controller = new AbortController()
 * try {
 *   return await compiled.data({ task, taskId: task.id, params: {}, trigger: { type: 'manual', source: null } }, controller.signal)
 * } catch (error) {
 *   // 返回的 handler 可 reject；此调用边界转换为领域结果。
 *   return err(HaiSchedulerError.EXECUTION_FAILED, schedulerM('scheduler_executionStateFailed'), error)
 * }
 * ```
 */
export function compileJsTaskHandler(config: JsTaskConfig): HaiResult<JsTaskHandler> {
  const cacheKey = createCacheKey(config)
  const cachedHandler = compiledHandlerCache.get(cacheKey)
  if (cachedHandler)
    return ok(cachedHandler)

  try {
    // 主线程仅解析语法，不执行表达式或任务函数。
    void new Script(`(${config.code})`)

    const handler: JsTaskHandler = async (context, signal) => {
      signal?.throwIfAborted()
      return await new Promise<unknown>((resolve, reject) => {
        const timeout = config.timeout ?? 30000
        const worker = new Worker(new URL('./scheduler-js-worker.js', import.meta.url), {
          workerData: { code: config.code, context },
          execArgv: [],
        })
        let settled = false
        let timer: ReturnType<typeof setTimeout> | undefined
        const aborted = () => finish(new Error(schedulerM('scheduler_closing')))
        function finish(error?: Error, result?: unknown): void {
          if (settled)
            return
          settled = true
          clearTimeout(timer)
          signal?.removeEventListener('abort', aborted)
          // 等待线程停止后才结束本次尝试，禁止超时任务与后续重试并行。
          void worker.terminate().then(() => error ? reject(error) : resolve(result), reject)
        }
        timer = setTimeout(() => finish(new Error(schedulerM('scheduler_jsTimedOut', { params: { timeout } }))), timeout)
        signal?.addEventListener('abort', aborted, { once: true })
        worker.once('error', error => finish(error instanceof Error ? error : new Error(String(error))))
        worker.once('exit', code => finish(new Error(`JS worker exited before returning a result (${code})`)))
        worker.once('message', (message: { success: boolean, data?: unknown, message?: string }) => {
          if (message.success)
            finish(undefined, message.data)
          else
            finish(new Error(message.message))
        })
      })
    }

    compiledHandlerCache.set(cacheKey, handler)
    return ok(handler)
  }
  catch (error) {
    return err(
      HaiSchedulerError.JS_COMPILE_FAILED,
      schedulerM('scheduler_jsCompileFailed', {
        params: { error: error instanceof Error ? error.message : String(error) },
      }),
      error,
    )
  }
}
