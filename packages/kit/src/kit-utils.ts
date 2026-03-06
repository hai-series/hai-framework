/**
 * @h-ai/kit — 内部工具函数
 *
 * 提取 Handler 与 Handle 共享的 SvelteKit 控制流检测逻辑。
 * @module kit-utils
 */

/**
 * 检测是否为 Response 对象（兼容跨模块 instanceof 失效场景）
 *
 * 在 Vite 开发环境下，不同模块可能引用不同的 `Response` 构造器，
 * 导致 `instanceof Response` 返回 false。通过特征检测兜底辨识。
 *
 * @param value - 待检测值
 * @returns 是否为 Response（或 Response-like 对象）
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
 * redirect 特征：`{ status, location }` 且 status 为 number
 * error 特征：`{ status, body }` 且 status 为 number
 *
 * @param value - 被捕获的异常
 * @returns 是否为 SvelteKit 控制流
 */
export function isSvelteKitControlFlow(value: unknown): boolean {
  // Response 对象不是控制流
  if (isResponseLike(value))
    return false
  if (typeof value === 'object' && value !== null && 'status' in value) {
    const status = (value as { status: unknown }).status
    return typeof status === 'number'
  }
  return false
}
