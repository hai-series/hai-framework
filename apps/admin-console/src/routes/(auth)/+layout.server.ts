/**
 * =============================================================================
 * hai Admin Console - 认证页面布局服务端
 * =============================================================================
 * 将 IAM 公开配置传递给认证相关页面（登录、注册、重置密码等）
 * =============================================================================
 */

import type { LayoutServerLoad } from './$types'
import { requireAdminData } from '$lib/server/iam-admin.js'
import { iam } from '@h-ai/iam'

export const load: LayoutServerLoad = async () => {
  return {
    // hooks 已完成 IAM 初始化，直接使用同一份公开白名单配置。
    iamPublicConfig: requireAdminData(await iam.getPublicConfig()),
  }
}
