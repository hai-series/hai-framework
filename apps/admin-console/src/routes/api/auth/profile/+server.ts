import * as m from '$lib/paraglide/messages.js'
import { normalizeUniqueConstraintError } from '$lib/server/iam-helpers.js'
import { UpdateProfileSchema } from '$lib/server/schemas/index.js'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

/**
 * 构造含角色列表的用户响应对象（GET / PUT 共用）。
 */
async function toUserResponse(user: { id: string, username: string, email?: string | null, displayName?: string | null, phone?: string | null, avatarUrl?: string | null }) {
  const rolesResult = await iam.authz.getUserRoles(user.id)
  const roles = rolesResult.success ? rolesResult.data.map(r => r.code) : []
  return {
    id: user.id,
    username: user.username,
    email: user.email ?? '',
    display_name: user.displayName ?? '',
    phone: user.phone ?? '',
    avatar: user.avatarUrl ?? '',
    roles,
  }
}

export const GET = kit.handler(async ({ cookies }) => {
  const token = cookies.get('hai_session')
  if (!token) {
    return kit.response.unauthorized(m.common_error())
  }

  const userResult = await iam.user.getCurrentUser(token)
  if (!userResult.success) {
    return kit.response.unauthorized(m.common_error())
  }

  return kit.response.ok({ user: await toUserResponse(userResult.data) })
})

/**
 * 根据当前会话令牌更新用户资料字段。
 *
 * `username` / `email` 属于身份字段，不在 `updateCurrentUser` 白名单内，
 * 需通过 `iam.user.updateUser(userId, ...)` 进行更新。
 * 其余字段（displayName / avatarUrl / phone）走 `updateCurrentUser` 安全白名单。
 *
 * 更新完成后同步刷新缓存会话，使布局顶栏等立即读到最新值。
 *
 * @returns 更新结果，成功返回最新用户信息
 */
export const PUT = kit.handler(async ({ cookies, request }) => {
  const token = cookies.get('hai_session')
  if (!token) {
    return kit.response.unauthorized(m.common_error())
  }

  // 验证令牌并获取 userId（后续 updateUser 需要）
  const verifyResult = await iam.auth.verifyToken(token)
  if (!verifyResult.success) {
    return kit.response.unauthorized(m.common_error())
  }
  const userId = verifyResult.data.userId

  const data = await kit.validate.formOrFail(request, UpdateProfileSchema)

  const username = data?.username?.trim()
  const displayName = data?.display_name?.trim()
  const email = data?.email?.trim()
  const phone = data?.phone?.trim()
  const avatar = data?.avatar?.trim()

  // ── 合并所有字段为单次 updateUser 调用，保证原子性 ──
  const updatePatch: Partial<{ username: string, email: string, displayName: string, avatarUrl: string, phone: string }> = {}
  if (username)
    updatePatch.username = username
  if (email)
    updatePatch.email = email
  if (displayName)
    updatePatch.displayName = displayName
  if (avatar)
    updatePatch.avatarUrl = avatar
  if (phone)
    updatePatch.phone = phone

  if (Object.keys(updatePatch).length > 0) {
    const updateResult = await iam.user.updateUser(userId, updatePatch)
    if (!updateResult.success) {
      const normalizedError = normalizeUniqueConstraintError(updateResult.error.message, m.common_error())
      return kit.response.badRequest(
        normalizedError,
        undefined,
        { fieldErrors: { general: normalizedError } },
      )
    }
  }

  // ── 同步会话缓存，使布局顶栏等立即读到最新值 ──
  const sessionPatch: Partial<{ username: string, displayName: string, avatarUrl: string }> = {}
  if (username)
    sessionPatch.username = username
  if (displayName)
    sessionPatch.displayName = displayName
  if (avatar)
    sessionPatch.avatarUrl = avatar

  if (Object.keys(sessionPatch).length > 0) {
    await iam.session.update(token, sessionPatch)
  }

  // ── 查询最新用户信息返回 ──
  const updatedResult = await iam.user.getUser(userId)
  if (!updatedResult.success || !updatedResult.data) {
    return kit.response.internalError(m.common_error())
  }

  return kit.response.ok({ user: await toUserResponse(updatedResult.data) })
})
