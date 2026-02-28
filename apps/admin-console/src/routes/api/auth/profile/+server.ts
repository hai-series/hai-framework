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
 * @returns 更新结果，成功返回最新用户信息
 */
export const PUT = kit.handler(async ({ cookies, request }) => {
  const token = cookies.get('hai_session')
  if (!token) {
    return kit.response.unauthorized(m.common_error())
  }

  const data = await kit.validate.formOrFail(request, UpdateProfileSchema)

  const patch: {
    username?: string
    displayName?: string
    email?: string
    phone?: string
    avatarUrl?: string
  } = {}

  const username = data?.username?.trim()
  const displayName = data?.display_name?.trim()
  const email = data?.email?.trim()
  const phone = data?.phone?.trim()
  const avatar = data?.avatar?.trim()

  if (username) {
    patch.username = username
  }
  if (displayName) {
    patch.displayName = displayName
  }
  if (email) {
    patch.email = email
  }
  if (phone) {
    patch.phone = phone
  }
  if (avatar) {
    patch.avatarUrl = avatar
  }

  const updateResult = await iam.user.updateCurrentUser(token, patch)
  if (!updateResult.success) {
    const normalizedError = normalizeUniqueConstraintError(updateResult.error.message, m.common_error())
    return kit.response.badRequest(
      normalizedError,
      undefined,
      { fieldErrors: { general: normalizedError } },
    )
  }

  return kit.response.ok({ user: await toUserResponse(updateResult.data) })
})
