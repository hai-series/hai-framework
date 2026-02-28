/**
 * =============================================================================
 * Admin Console - IAM 共享辅助函数
 * =============================================================================
 *
 * 供 auth / iam API 路由复用的通用逻辑，避免跨文件重复实现。
 * =============================================================================
 */

import * as m from '$lib/paraglide/messages.js'
import { iam } from '@h-ai/iam'

/**
 * 将底层唯一键冲突错误映射为稳定的用户可读提示。
 *
 * @param message 底层错误消息
 * @param fallback 冲突以外的默认提示
 */
export function normalizeUniqueConstraintError(message: string | undefined, fallback: string): string {
  const lower = message?.toLowerCase() ?? ''
  if (lower.includes('unique constraint') || lower.includes('duplicate')) {
    return m.api_auth_username_or_email_taken()
  }
  return message ?? fallback
}

/**
 * IAM 用户对象转前端管理列表所需的标准响应格式（含角色）。
 */
export async function toIamUserResponse(user: {
  id: string
  username: string
  email?: string | null
  displayName?: string | null
  avatarUrl?: string | null
  enabled?: boolean
  createdAt: Date
  updatedAt: Date
}) {
  const rolesResult = await iam.authz.getUserRoles(user.id)
  const roles = rolesResult.success ? rolesResult.data.map(r => r.code) : []
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    display_name: user.displayName,
    avatar: user.avatarUrl,
    status: user.enabled !== false ? 'active' as const : 'inactive' as const,
    roles,
    created_at: user.createdAt,
    updated_at: user.updatedAt,
  }
}
