import { HaiIamError, iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'
import * as m from '#lib/paraglide/messages.js'
import { normalizeUniqueConstraintError, toIamProfileResponse } from '#lib/server/iam-admin.js'
import { UpdateProfileSchema } from '#lib/server/schemas/index.js'

export const GET = kit.handler(async ({ locals }) => {
  const locale = locals.locale === 'en-US'
    ? 'en-US'
    : locals.locale === 'ja-JP'
      ? 'ja-JP'
      : 'zh-CN'
  if (!locals.accessToken) {
    return kit.response.unauthorized(m.common_error({}, { locale }))
  }

  const userResult = await iam.user.getCurrentUser(locals.accessToken)
  if (!userResult.success) {
    return kit.response.unauthorized(m.common_error({}, { locale }))
  }

  return kit.response.ok({ user: await toIamProfileResponse(userResult.data) })
})

/**
 * 根据当前会话令牌更新用户资料字段。
 *
 * 联系方式变更后，IAM 作废旧会话。响应直接使用本次事务提交的资料。
 *
 * @returns 更新结果，成功返回最新用户信息
 */
export const PUT = kit.handler(async ({ request, locals, cookies }) => {
  await kit.guard.requireSensitive(iam, { request, cookies }, 'iam.profile.update')
  const locale = locals.locale === 'en-US'
    ? 'en-US'
    : locals.locale === 'ja-JP'
      ? 'ja-JP'
      : 'zh-CN'
  if (!locals.accessToken) {
    return kit.response.unauthorized(m.common_error({}, { locale }))
  }

  const data = await kit.validate.body(request, UpdateProfileSchema)
  const updated = await iam.user.updateCurrentUser(locals.accessToken, {
    username: data.username?.trim() || undefined,
    displayName: data.display_name?.trim() || undefined,
    email: data.email?.trim() || undefined,
    phone: data.phone?.trim() || undefined,
    avatarUrl: data.avatar?.trim() || undefined,
  })
  if (!updated.success) {
    if (updated.error.code !== HaiIamError.USER_ALREADY_EXISTS.code)
      return kit.response.fromError(updated.error)
    const normalizedError = normalizeUniqueConstraintError(updated.error.message, m.common_error({}, { locale }))
    return kit.response.badRequest(normalizedError, undefined, {
      fieldErrors: { general: normalizedError },
    })
  }

  return kit.response.ok({ user: await toIamProfileResponse(updated.data) })
})
