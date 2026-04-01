/**
 * @h-ai/scheduler — JS 任务编译器
 *
 * 将 JS 函数字符串编译为可执行函数，并基于源码缓存编译结果。
 * @module scheduler-js-compiler
 */

import type { HaiResult } from '@h-ai/core'

import type { JsTaskConfig, JsTaskHandler } from './scheduler-types.js'
import { createHash } from 'node:crypto'
import { Script } from 'node:vm'
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

export function clearJsTaskHandlerCache(): void {
  compiledHandlerCache.clear()
}

export function compileJsTaskHandler(config: JsTaskConfig): HaiResult<JsTaskHandler> {
  const cacheKey = createCacheKey(config)
  const cachedHandler = compiledHandlerCache.get(cacheKey)
  if (cachedHandler)
    return ok(cachedHandler)

  try {
    const script = new Script(`(${config.code})`)
    const candidate = script.runInNewContext({})
    if (typeof candidate !== 'function') {
      return err(
        HaiSchedulerError.JS_COMPILE_FAILED,
        schedulerM('scheduler_jsCompileFailed', { params: { error: 'Compiled result is not a function' } }),
      )
    }

    const handler: JsTaskHandler = async (context) => {
      const functionResult = (candidate as JsTaskHandler)(context)
      if (!config.timeout || config.timeout <= 0)
        return functionResult

      // 使用显式 Promise，确保函数提前完成时定时器被清理，避免定时器泄漏
      return await new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`JS task timed out after ${config.timeout}ms`))
        }, config.timeout!)
        Promise.resolve(functionResult).then(
          (result) => {
            clearTimeout(timer)
            resolve(result)
          },
          (error) => {
            clearTimeout(timer)
            reject(error)
          },
        )
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
