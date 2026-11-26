/** HTTP 宿主共用的会话验证结果与权限匹配。 */
import type { HttpSession, HttpVerifyToken } from '../core-types.js'
import { err, HaiCommonError, ok } from '../core-types.js'

async function verifySession(verifyToken: HttpVerifyToken, accessToken: string) {
  try {
    const result = await verifyToken(accessToken)
    if (result.success) {
      const { userId, username, displayName, avatarUrl, roles, permissions, data } = result.data
      const session: HttpSession = {
        userId,
        username,
        displayName,
        avatarUrl,
        roles,
        permissions,
      }
      if (data)
        session.data = Object.fromEntries(Object.entries(data).filter(([name]) => name !== '_tokenPair'))
      return ok(session)
    }
    const status = result.error.httpStatus ?? 500
    if (Number.isInteger(status) && status >= 400 && status < 500)
      return ok(undefined)
    const httpStatus = Number.isInteger(status) && status >= 500 && status < 600
      ? status
      : 500
    return err({ ...HaiCommonError.INTERNAL_ERROR, httpStatus }, 'Access token verification failed', result.error)
  }
  catch (cause) {
    return err(HaiCommonError.INTERNAL_ERROR, 'Access token verification failed', cause)
  }
}

function matchPermission(required: string, granted: readonly string[]): boolean {
  return granted.some(permission => permission === required || permission === '*'
    || (permission.endsWith(':*') && required.startsWith(permission.slice(0, -1))))
}

/**
 * HTTP 宿主的令牌验证和访问快照匹配。
 * @example
 * ```ts
 * import { core } from '@h-ai/core'
 * const canRead = core.auth.matchPermission('orders:read', ['orders:*'])
 * ```
 */
export const auth = { verifySession, matchPermission }
