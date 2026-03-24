/**
 * @h-ai/scheduler — JS 任务编译器
 *
 * 将 JS 函数字符串编译为可执行函数，并基于源码缓存编译结果。
 * @module scheduler-js-compiler
 */

import type { Result } from '@h-ai/core'
import type { JsTaskConfig, JsTaskHandler, SchedulerError } from './scheduler-types.js'

import { createHash } from 'node:crypto'
import { Script } from 'node:vm'
import { err, ok } from '@h-ai/core'

import { SchedulerErrorCode } from './scheduler-config.js'
import { schedulerM } from './scheduler-i18n.js'

/** 已编译 JS 处理器缓存 */
const compiledHandlerCache = new Map<string, JsTaskHandler>()

function createCacheKey(config: JsTaskConfig): string {
  return createHash('sha256').update(config.code).digest('hex')
}

export function clearJsTaskHandlerCache(): void {
  compiledHandlerCache.clear()
}

export function compileJsTaskHandler(config: JsTaskConfig): Result<JsTaskHandler, SchedulerError> {
  const cacheKey = createCacheKey(config)
  const cachedHandler = compiledHandlerCache.get(cacheKey)
  if (cachedHandler)
    return ok(cachedHandler)

  try {
    const script = new Script(`(${config.code})`)
    const candidate = script.runInNewContext({})
    if (typeof candidate !== 'function') {
      return err({
        code: SchedulerErrorCode.JS_COMPILE_FAILED,
        message: schedulerM('scheduler_jsCompileFailed', { params: { error: 'Compiled result is not a function' } }),
      })
    }

    const handler: JsTaskHandler = async (context) => {
      const functionResult = (candidate as JsTaskHandler)(context)
      if (!config.timeout || config.timeout <= 0)
        return functionResult

      return await Promise.race([
        Promise.resolve(functionResult),
        new Promise<never>((_, reject) => {
          const timer = setTimeout(() => {
            clearTimeout(timer)
            reject(new Error(`JS task timed out after ${config.timeout}ms`))
          }, config.timeout)
        }),
      ])
    }

    compiledHandlerCache.set(cacheKey, handler)
    return ok(handler)
  }
  catch (error) {
    return err({
      code: SchedulerErrorCode.JS_COMPILE_FAILED,
      message: schedulerM('scheduler_jsCompileFailed', {
        params: { error: error instanceof Error ? error.message : String(error) },
      }),
      cause: error,
    })
  }
}
