/**
 * @h-ai/kit — 内部工具函数
 *
 * 提取 Handler、Handle 和中间件共享的请求处理工具。
 * @module kit-utils
 */

import { isHttpError, isRedirect } from '@sveltejs/kit'

/**
 * 追加框架响应头，兼容 Fetch 和原生重定向的不可变 headers。
 * @example 模块内部上下文
 * ```ts
 * const response = setResponseHeaders(new Response('OK'), { 'X-Request-Id': 'request-1' })
 * void response
 * ```
 */
export function setResponseHeaders(response: Response, headers: Record<string, string>): Response {
  const write = (target: Response) => {
    for (const [name, value] of Object.entries(headers))
      target.headers.set(name, value)
    return target
  }

  try {
    return write(response)
  }
  catch (error) {
    if (!(error instanceof TypeError))
      throw error
    // 复用原正文流，保留原 HTTP 状态和多值 Set-Cookie。
    return write(new Response(response.body, response))
  }
}

/**
 * 检测是否为 Response 对象（兼容跨模块 instanceof 失效场景）
 *
 * 在 Vite 开发环境下，不同模块可能引用不同的 `Response` 构造器，
 * 导致 `instanceof Response` 返回 false。通过特征检测兜底辨识。
 *
 * @param value - 待检测值
 * @returns 是否为 Response（或 Response-like 对象）
 * @example 模块内部上下文
 * ```ts
 * const value: unknown = new Response('ready')
 * if (isResponseLike(value)) void value.status
 * ```
 */
export function isResponseLike(value: unknown): value is Response {
  if (value instanceof Response)
    return true
  if (
    typeof value === 'object'
    && value !== null
    && 'status' in value
    && 'headers' in value
    && typeof (value as Response).text === 'function'
    && typeof (value as Response).json === 'function'
  ) {
    return true
  }
  return false
}

/**
 * 检测是否为 SvelteKit 控制流对象（redirect / error）
 *
 * SvelteKit 的 `redirect()` 和 `error()` 会抛出带 `status` 属性的特殊对象，
 * 框架在上层捕获后做控制流处理。此类对象必须继续抛出，不可吞掉。
 *
 * 只接受 SvelteKit 官方识别的控制流；带 status 的普通 SDK 异常仍走统一错误边界。
 *
 * @param value - 被捕获的异常
 * @returns 是否为 SvelteKit 控制流
 * @example 模块内部上下文
 * ```ts
 * const passthrough = isSvelteKitControlFlow(new Response(null, { status: 303 }))
 * void passthrough
 * ```
 */
export function isSvelteKitControlFlow(value: unknown): boolean {
  return isHttpError(value) || isRedirect(value)
}
