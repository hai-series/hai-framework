/**
 * =============================================================================
 * Admin Console - API Key 管理 API（列表 / 创建）
 * =============================================================================
 */

import { CreateApiKeySchema, ListApiKeysQuerySchema } from '$lib/server/schemas/index.js'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

/**
 * GET /api/iam/apikeys - 列出指定用户的 API Key
 *
 * 需要权限：apikey:list
 *
 * 查询参数：
 * - userId: 用户 ID（必须）
 */
export const GET = kit.handler(async ({ url, locals }) => {
  kit.guard.require(locals.session, 'apikey:list')

  const { userId } = kit.validate.query(url, ListApiKeysQuerySchema)

  const result = await iam.apiKey.listApiKeys(userId)
  if (!result.success) {
    return kit.response.internalError(result.error.message)
  }

  return kit.response.ok({ apiKeys: result.data })
})

/**
 * POST /api/iam/apikeys - 创建 API Key
 *
 * 需要权限：apikey:create
 *
 * 请求体：
 * - userId: 所属用户 ID
 * - name: API Key 名称
 * - expirationDays: 有效期天数（可选，0 表示永不过期）
 * - scopes: 权限范围（可选）
 *
 * 注意：明文密钥仅在此次响应中返回，之后无法再获取。
 */
export const POST = kit.handler(async ({ request, locals }) => {
  kit.guard.require(locals.session, 'apikey:create')

  const { userId, name, expirationDays, scopes } = await kit.validate.body(request, CreateApiKeySchema)

  const result = await iam.apiKey.createApiKey(userId, { name, expirationDays, scopes })
  if (!result.success) {
    return kit.response.badRequest(result.error.message)
  }

  return kit.response.created(result.data)
})
