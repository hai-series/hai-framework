/**
 * =============================================================================
 * Admin Console - API 请求工具
 * =============================================================================
 * 封装 fetch，自动附加 CSRF Token 到写请求（POST/PUT/DELETE）。
 * =============================================================================
 */

/**
 * 从 document.cookie 中读取指定名称的 Cookie 值
 *
 * @param name - Cookie 名称
 * @returns Cookie 值；不存在或运行在服务端时返回 undefined
 */
function getCookie(name: string): string | undefined {
  if (typeof document === 'undefined')
    return undefined
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
  return match?.[1]
}

/**
 * API 请求封装：自动附加 CSRF Token 到写请求
 *
 * 写方法（POST / PUT / DELETE 等）会自动读取 `hai_csrf` Cookie
 * 并设置 `X-CSRF-Token` 请求头。
 *
 * @param url - 请求地址
 * @param options - 标准 fetch 选项
 * @returns fetch Response
 *
 * @example
 * ```ts
 * const response = await apiFetch('/api/iam/users', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify(data),
 * })
 * ```
 */
export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const method = (options.method ?? 'GET').toUpperCase()
  const isWriteMethod = !['GET', 'HEAD', 'OPTIONS'].includes(method)

  if (isWriteMethod) {
    const csrfToken = getCookie('hai_csrf')
    if (csrfToken) {
      const headers = new Headers(options.headers)
      headers.set('X-CSRF-Token', csrfToken)
      options = { ...options, headers }
    }
  }

  return fetch(url, options)
}
