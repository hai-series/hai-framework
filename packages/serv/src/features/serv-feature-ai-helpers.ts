/** @h-ai/serv — AI procedure 的共享错误与请求取消处理。 */

import type { HaiResult } from '@h-ai/core'
import type { ServContext } from '../serv-context.js'
import { core, HaiCommonError } from '@h-ai/core'
import { servM } from '../serv-i18n.js'

/**
 * 当前会话缺少 AI 能力所需的资源授权。
 * @example 模块内部上下文
 * ```ts
 * const denied = forbidden({ locale: 'en-US' })
 * void denied
 * ```
 */
export function forbidden({ locale }: Pick<ServContext, 'locale'>): HaiResult<never> {
  return core.err(HaiCommonError.FORBIDDEN, servM('serv_errorForbidden', { locale }))
}

/**
 * 宿主未注入这个路由尝试使用的 AI 能力。
 * @example 模块内部上下文
 * ```ts
 * const missing = unavailable({ locale: 'ja-JP' })
 * void missing
 * ```
 */
export function unavailable({ locale }: Pick<ServContext, 'locale'>): HaiResult<never> {
  return core.err(HaiCommonError.SERVICE_UNAVAILABLE, servM('serv_errorInternal', { locale }))
}

/**
 * HTTP 请求关闭或 procedure 取消时中断流式调用与媒体处理。
 * @example 模块内部上下文
 * ```ts
 * const signal = requestSignal({ request: new Request('https://example.com') })
 * signal.throwIfAborted()
 * ```
 */
export function requestSignal(context: Pick<ServContext, 'request'>, signal?: AbortSignal): AbortSignal {
  const request = context.request.signal
  return signal && signal !== request
    ? AbortSignal.any([request, signal])
    : request
}
