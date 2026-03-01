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

  // ── 身份字段（username / email）通过 updateUser 更新 ──
  const identityPatch: Partial<{ username: string, email: string }> = {}
  if (username)
    identityPatch.username = username
  if (email)
    identityPatch.email = email

  if (Object.keys(identityPatch).length > 0) {
    const identityResult = await iam.user.updateUser(userId, identityPatch)
    if (!identityResult.success) {
      const normalizedError = normalizeUniqueConstraintError(identityResult.error.message, m.common_error())
      return kit.response.badRequest(
        normalizedError,
        undefined,
        { fieldErrors: { general: normalizedError } },
      )
    }
  }

  // ── 个人资料字段走 updateCurrentUser 白名单 ──
  const profilePatch: { displayName?: string, avatarUrl?: string, phone?: string } = {}
  if (displayName)
    profilePatch.displayName = displayName
  if (avatar)
    profilePatch.avatarUrl = avatar
  if (phone)
    profilePatch.phone = phone

  if (Object.keys(profilePatch).length > 0) {
    const profileResult = await iam.user.updateCurrentUser(token, profilePatch)
    if (!profileResult.success) {
      return kit.response.badRequest(profileResult.error.message)
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
