/**
 * =============================================================================
 * Admin Console - IAM 相关 Zod 验证 Schema
 * =============================================================================
 *
 * 用于 IAM API 路由的请求体和查询参数验证。
 * 密码最小长度从 IAM 配置读取，保持前后端一致。
 * =============================================================================
 */

import * as m from '$lib/paraglide/messages.js'
import { iam } from '@h-ai/iam'
import { z } from 'zod'

/**
 * 从 IAM 配置获取密码最小长度，回退到默认值 8。
 */
function getPasswordMinLength(): number {
  return iam.config?.password?.minLength ?? 8
}

/**
 * 路径参数 id 校验 Schema
 *
 * 验证 `event.params.id` 非空字符串。
 */
export const IdParamSchema = z.object({
  id: z.string().min(1, 'ID is required'),
})

/** 分页 pageSize 上限，防止一次性拉取全表造成 DoS */
const MAX_PAGE_SIZE = 100

/** 用户列表查询参数 Schema */
export const ListUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(20),
  search: z.string().optional(),
  enabled: z
    .enum(['true', 'false'])
    .transform(v => v === 'true')
    .optional(),
})

/** 创建用户请求 Schema */
export function createCreateUserSchema() {
  const minLen = getPasswordMinLength()
  return z.object({
    username: z.string().regex(/^\w{3,20}$/, m.api_auth_username_format_invalid()),
    email: z.string().regex(/^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/, m.api_auth_email_invalid()),
    password: z.string().min(minLen, m.api_auth_password_too_short()),
    display_name: z.string().optional(),
    roles: z.array(z.string()).optional(),
    status: z.enum(['active', 'inactive', 'suspended']).optional(),
  })
}

/** 更新用户请求 Schema */
export function createUpdateUserSchema() {
  const minLen = getPasswordMinLength()
  return z.object({
    username: z.string().regex(/^\w{3,20}$/, m.api_auth_username_format_invalid()).optional(),
    email: z.string().regex(/^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/, m.api_auth_email_invalid()).optional(),
    password: z.string().min(minLen).optional(),
    display_name: z.string().optional(),
    roles: z.array(z.string()).optional(),
    status: z.enum(['active', 'inactive', 'suspended']).optional(),
  })
}

/** 更新当前用户资料 Schema */
export const UpdateProfileSchema = z.object({
  username: z.string().regex(/^\w{3,20}$/, m.api_auth_username_format_invalid()).optional(),
  display_name: z.string().optional(),
  email: z.string().regex(/^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/, m.api_auth_email_invalid()).optional(),
  phone: z.string().optional(),
  avatar: z.string().optional(),
})

export function createChangeCurrentPasswordSchema() {
  const minLen = getPasswordMinLength()
  return z
    .object({
      old_password: z.string().min(1, m.api_common_required_fields()),
      new_password: z.string().min(minLen, m.api_auth_password_too_short()),
      confirm_password: z.string().min(1, m.api_common_required_fields()),
    })
    .refine(data => data.new_password === data.confirm_password, {
      message: m.api_auth_password_mismatch(),
      path: ['confirm_password'],
    })
}

/** 创建角色请求 Schema */
export const CreateRoleSchema = z.object({
  name: z.string().trim().min(1, m.api_iam_roles_name_required()),
  description: z.string().optional(),
  permissions: z.array(z.string()).optional(),
})

/** 更新角色请求 Schema */
export const UpdateRoleSchema = z.object({
  name: z.string().trim().min(1, m.api_iam_roles_name_required()).optional(),
  description: z.string().optional(),
  permissions: z.array(z.string()).optional(),
})

/** 权限列表查询参数 Schema */
export const ListPermissionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(20),
  search: z.string().optional(),
  type: z.enum(['menu', 'api', 'button']).optional(),
})

/**
 * 权限 resource / action 字段格式校验
 *
 * 仅允许小写字母、数字、下划线，禁止 `*` 等通配符字符，
 * 防止通过创建 `resource:*` 等通配权限进行权限提升。
 */
const SAFE_IDENTIFIER = /^[a-z][a-z0-9_]*$/

/** 创建权限请求 Schema */
export const CreatePermissionSchema = z.object({
  name: z.string().trim().min(1, m.api_common_required_fields()),
  description: z.string().optional(),
  resource: z.string().trim().min(1, m.api_common_required_fields()).regex(SAFE_IDENTIFIER, m.api_common_invalid_format()),
  action: z.string().trim().min(1, m.api_common_required_fields()).regex(SAFE_IDENTIFIER, m.api_common_invalid_format()),
  type: z.enum(['menu', 'api', 'button']).optional(),
})
