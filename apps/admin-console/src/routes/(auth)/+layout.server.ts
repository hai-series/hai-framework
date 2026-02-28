/**
 * =============================================================================
 * hai Admin Console - 认证页面布局服务端
 * =============================================================================
 * 将 IAM 公开配置传递给认证相关页面（登录、注册、重置密码等）
 * =============================================================================
 */

import type { LayoutServerLoad } from './$types'
import { buildIamPublicConfig } from '$lib/server/iam-public-config'

export const load: LayoutServerLoad = async () => {
  return {
    iamPublicConfig: buildIamPublicConfig(),
  }
}
