/** 顺序启动、反序关闭的薄编排，不持有模块配置、依赖容器或业务服务。 */
import type { HaiError, HaiResult } from '../core-types.js'
import { HaiCommonError } from '../core-types.js'
import { i18n } from '../i18n/core-i18n-utils.js'

/**
 * 单个真实模块或业务钩子的资源所有权；close 应可重试。
 * @example 模块内部上下文
 * ```ts
 * const step: RuntimeStep = { name: 'example', start: () => {}, close: () => {} }
 * ```
 */
interface RuntimeStep {
  name: string
  enabled?: () => boolean
  start: () => void | HaiResult<unknown> | Promise<void | HaiResult<unknown>>
  close: () => void | HaiResult<unknown> | Promise<void | HaiResult<unknown>>
}

/**
 * 初始化和关闭合并并发调用；失败关闭保留自身及尚未关闭的依赖，供下次重试。
 * @example 模块内部上下文
 * ```ts
 * const runtime: ModuleRuntime = createRuntime([])
 * await runtime.close()
 * ```
 */
interface ModuleRuntime {
  readonly isInitialized: boolean
  start: () => Promise<HaiResult<void>>
  close: () => Promise<HaiResult<void>>
}

function failure(module: string, phase: 'start' | 'close', detail?: unknown): { success: false, error: HaiError } {
  const fields: string[] = []
  if (detail && typeof detail === 'object' && 'ext' in detail && detail.ext && typeof detail.ext === 'object' && 'fields' in detail.ext && Array.isArray(detail.ext.fields)) {
    fields.push(...detail.ext.fields.filter((field: unknown): field is string => typeof field === 'string' && /^[\w.[\]-]{1,200}$/.test(field)))
  }
  if (detail && typeof detail === 'object' && 'issues' in detail && Array.isArray(detail.issues)) {
    for (const issue of detail.issues) {
      if (issue && typeof issue === 'object' && 'path' in issue && Array.isArray(issue.path)) {
        const path = issue.path.filter((part: unknown) => typeof part === 'string' || typeof part === 'number').join('.')
        if (/^[\w.[\]-]{1,200}$/.test(path))
          fields.push(path)
      }
    }
  }
  const code = detail && typeof detail === 'object' && 'code' in detail && (typeof detail.code === 'number' || typeof detail.code === 'string') ? detail.code : undefined
  return { success: false, error: { ...HaiCommonError.INIT_FAILED, message: i18n.coreM(phase === 'start' ? 'core_runtimeStartFailed' : 'core_runtimeCloseFailed', { params: { module } }), ext: { module, phase, ...(code !== undefined ? { code } : {}), ...(fields.length ? { fields } : {}) } } }
}

/**
 * 编排宿主明确拥有的模块和业务钩子，不推断模块类型或初始化参数。
 * start/close 合并并发；启动失败反序回滚；关闭失败保留依赖和清理义务，下次 close/start 会重试。
 * @param definitions - 按真实依赖顺序声明的初始化和关闭动作。
 * @returns 不抛业务异常的生命周期控制器；异常只报告模块、阶段、错误码和配置字段路径。
 * @example
 * ```ts
 * import { core, ok } from '@h-ai/core'
 * const runtime = core.module.createRuntime([
 *   { name: 'application', start: () => ok(undefined), close: () => ok(undefined) },
 * ])
 * const started = await runtime.start()
 * if (started.success) await runtime.close()
 * ```
 */
export function createRuntime(definitions: readonly RuntimeStep[]): ModuleRuntime {
  const steps = definitions.map(step => ({ ...step }))
  const owned: RuntimeStep[] = []
  let initialized = false
  let starting: Promise<HaiResult<void>> | undefined
  let closing: Promise<HaiResult<void>> | undefined

  async function cleanup(): Promise<HaiResult<void>> {
    initialized = false
    while (owned.length) {
      const step = owned.at(-1)!
      try {
        const result = await step.close()
        if (result && !result.success)
          return failure(step.name, 'close', result.error)
        owned.pop()
      }
      catch (cause) {
        return failure(step.name, 'close', cause)
      }
    }
    return { success: true, data: undefined }
  }

  async function initialize(): Promise<HaiResult<void>> {
    if (owned.length) {
      const cleaned = await cleanup()
      if (!cleaned.success)
        return cleaned
    }
    for (const step of steps) {
      let startFailure: { success: false, error: HaiError } | undefined
      try {
        if (step.enabled && !step.enabled())
          continue
        // 先登记义务，覆盖 start 抛错或部分分配后失败的情况。
        owned.push(step)
        const result = await step.start()
        if (result && !result.success)
          startFailure = failure(step.name, 'start', result.error)
      }
      catch (cause) {
        startFailure = failure(step.name, 'start', cause)
      }
      if (startFailure) {
        const cleaned = await cleanup()
        if (!cleaned.success)
          startFailure.error.ext = { ...startFailure.error.ext, cleanup: cleaned.error.ext }
        return startFailure
      }
    }
    initialized = true
    return { success: true, data: undefined }
  }

  return {
    get isInitialized() {
      return initialized
    },
    async start() {
      if (closing)
        await closing
      if (initialized)
        return { success: true, data: undefined }
      starting ??= initialize().finally(() => {
        starting = undefined
      })
      return starting
    },
    close() {
      closing ??= (async () => {
        await starting
        return cleanup()
      })().finally(() => {
        closing = undefined
      })
      return closing
    },
  }
}
