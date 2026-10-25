/**
 * @h-ai/core — 错误注册与处理
 *
 * 提供统一的错误定义生成与实例化能力。
 *
 * @module core-function-error
 */

import type { HaiError, HaiErrorDef } from '../core-types'
import { i18n } from '../i18n/core-i18n-utils.js'
import { sanitize } from '../utils/core-util-sanitize.js'
import { requestContext } from './core-function-context.js'
import { id } from './core-function-id.js'

/**
 * 错误提示末尾显示关联标识；重复格式化不会重复追加。
 * @example
 * ```ts
 * import { core } from '@h-ai/core'
 * const message = core.error.formatMessage({ message: '保存失败', traceId: 'request-1' })
 * ```
 */
function formatMessage(error: Pick<HaiError, 'message' | 'traceId'>): string {
  return error.traceId && /^[\w.:-]{1,128}$/.test(error.traceId) && !error.message.endsWith(`(traceId: ${error.traceId})`)
    ? `${error.message} (traceId: ${error.traceId})`
    : error.message
}

/**
 * HTTP/UI 边界仅公开安全消息和关联标识；内部异常及扩展信息留在脱敏日志。
 * @example
 * ```ts
 * import { core } from '@h-ai/core'
 * const safe = core.error.toPublic({ code: 'app:failed', message: 'Internal detail', httpStatus: 500 }, 'request-1')
 * ```
 */
function toPublic(error: HaiError, traceId?: string, locale?: string): HaiError {
  const context = requestContext.get()
  const candidate = traceId ?? context.traceId ?? context.requestId ?? error.traceId
  const safeTraceId = candidate && /^[\w.:-]{1,128}$/.test(candidate) ? candidate : id.uuid()
  const result: HaiError = {
    code: error.code,
    message: (error.httpStatus ?? 400) >= 500 ? i18n.coreM('core_errorInternal', { locale }) : sanitize.sanitizeText(error.message),
    traceId: safeTraceId,
    ...(error.httpStatus !== undefined ? { httpStatus: error.httpStatus } : {}),
    ...(error.system ? { system: error.system } : {}),
    ...(error.module ? { module: error.module } : {}),
  }
  if (error.publicExt)
    result.ext = sanitize.sanitizeSensitiveFields(error.publicExt)
  // 字段校验只携带已本地化的 field/message，不复制 rejectedValue 或原始 Zod issue。
  if ((error.httpStatus === 400 || error.httpStatus === 422) && Array.isArray(error.cause)) {
    result.cause = error.cause.flatMap((item: unknown) => item && typeof item === 'object' && 'field' in item && typeof item.field === 'string' && 'message' in item && typeof item.message === 'string'
      ? [{ field: item.field, message: sanitize.sanitizeText(item.message) }]
      : [])
  }
  result.message = formatMessage(result)
  return result
}

/**
 * 根据模块错误映射生成标准错误定义对象。
 *
 * 将错误信息映射（如 `{ CONFIG_NOT_FOUND: '010:500' }`）转换为结构化的 HaiErrorDef，
 * 自动组装完整的错误码（格式：`system:module:code`）以及对应的 HTTP 状态码。
 *
 * @template T - 错误信息映射的类型
 *
 * @param module - 模块名称（如 'core'、'db'、'api'），会作为错误码的第二段
 * @param errorInfo - 错误信息映射对象，值格式为 `'错误码数字:HTTP状态码'`（如 `'010:500'`）
 * @param system - 系统标识，默认 'hai'，会作为错误码的第一段
 *
 * @returns 返回同类型的错误定义对象，每个 key 对应一个 HaiErrorDef 对象
 *
 * @example
 * ```ts
 * const ConfigErrorInfo = {
 *   FILE_NOT_FOUND: '010:500',
 *   PARSE_ERROR: '011:500',
 *   VALIDATION_ERROR: '012:500',
 * } as const
 *
 * const ConfigError = buildHaiErrorsDef('core', ConfigErrorInfo)
 * // =>
 * // ConfigError.FILE_NOT_FOUND = {
 * //   code: 'hai:core:010',
 * //   httpStatus: 500,
 * //   system: 'hai',
 * //   module: 'core',
 * // }
 * ```
 */
function buildHaiErrorsDef<T extends Record<string, string>>(module: string, errorInfo: T, system: string = 'hai'): { [K in keyof T]: HaiErrorDef } {
  const result = {} as { [K in keyof T]: HaiErrorDef }
  for (const key in errorInfo) {
    const [codeNum, httpStatusStr] = errorInfo[key].split(':')
    result[key as keyof T] = {
      code: `${system}:${module}:${codeNum}`,
      httpStatus: Number(httpStatusStr),
      system,
      module,
    }
  }
  return result
}

/**
 * 根据错误定义创建错误实例。
 *
 * 将 HaiErrorDef（错误定义）扩展为 HaiError（运行时错误实例），
 * 添加具体的错误消息、原因和建议等运行时信息。
 *
 * @param def - 错误定义对象（通常由 buildHaiErrorsDef 生成）
 * @param message - 错误消息（描述此次具体发生了什么）
 * @param cause - 原始错误原因（可选，用于链式错误追踪）
 * @param suggestion - 用户可采取的建议（可选，如 "'请检查配置文件格式'）
 *
 * @returns 返回完整的 HaiError 实例，包含错误码、HTTP 状态、消息、原因和建议
 *
 * @example
 * ```ts
 * const err = buildHaiErrorInst(
 *   HaiConfigError.FILE_NOT_FOUND,
 *   'config.yml 文件不存在',
 *   new Error('ENOENT: no such file'),
 *   '请确保 _core.yml 在项目根目录'
 * )
 * // => {
 * //   code: 'hai:core:010',
 * //   httpStatus: 500,
 * //   system: 'hai',
 * //   module: 'core',
 * //   message: 'config.yml 文件不存在',
 * //   cause: Error('ENOENT: no such file'),
 * //   suggestion: '请确保 _core.yml 在项目根目录'
 * // }
 * ```
 */
function buildHaiErrorInst(def: HaiErrorDef, message: string, cause?: unknown, suggestion?: string): HaiError {
  const inst: HaiError = { ...def, message }
  if (cause !== undefined)
    inst.cause = cause
  if (suggestion !== undefined)
    inst.suggestion = suggestion
  return inst
}

/**
 * 错误定义生成及错误实例组装工具；通过 core.error 使用。
 * @example
 * ```ts
 * import { core } from '@h-ai/core'
 * const tools = core.error
 * tools.buildHaiErrorsDef('orders', { NOT_FOUND: '001:404' })
 * ```
 */
export const error = {
  buildHaiErrorsDef,
  buildHaiErrorInst,
  formatMessage,
  toPublic,
}

/**
 * error 子工具类型
 * @example 模块内部上下文
 * ```ts
 * const tools: ErrorFn = error
 * tools.buildHaiErrorsDef('orders', { NOT_FOUND: '001:404' })
 * ```
 */
export type ErrorFn = typeof error
