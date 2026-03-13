/**
 * =============================================================================
 * Admin Console - 单个 API Key 管理 API（详情 / 吊销）
 * =============================================================================
 */

import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

/**
 * GET /api/iam/apikeys/[id] - 获取 API Key 详情
 *
 * 需要权限：apikey:list
 */
export const GET = kit.handler(async ({ params, locals }) => {
  kit.guard.require(locals.session, 'apikey:list')

  const { id } = kit.validate.params(params, kit.validate.IdParamSchema)

  const result = await iam.apiKey.getApiKey(id)
  if (!result.success) {
    return kit.response.internalError(result.error.message)
  }

  if (!result.data) {
    return kit.response.notFound('API Key not found')
  }

  return kit.response.ok(result.data)
})

/**
 * DELETE /api/iam/apikeys/[id] - 吊销/删除 API Key
 *
 * 需要权限：apikey:delete
 */
export const DELETE = kit.handler(async ({ params, locals }) => {
  kit.guard.require(locals.session, 'apikey:delete')

  const { id } = kit.validate.params(params, kit.validate.IdParamSchema)

  const result = await iam.apiKey.revokeApiKey(id)
  if (!result.success) {
    return kit.response.badRequest(result.error.message)
  }

  return kit.response.noContent()
})
