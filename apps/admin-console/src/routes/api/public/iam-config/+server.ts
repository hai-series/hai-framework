/**
 * =============================================================================
 * Admin Console - 公开 API: IAM 配置
 * =============================================================================
 * 返回 IAM 的公开配置子集（密码策略、注册开关、登录方式、协议等），
 * 供前端表单校验和 UI 展示使用。
 * =============================================================================
 */

import { buildIamPublicConfig } from '$lib/server/iam-public-config'
import { kit } from '@h-ai/kit'

export const GET = kit.handler(async () => {
  return kit.response.ok(buildIamPublicConfig({ includeSession: true }))
})
