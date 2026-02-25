/**
 * =============================================================================
 * Admin Console - IAM 相关 Zod 验证 Schema
 * =============================================================================
 *
 * 用于 IAM API 路由的请求体和查询参数验证。
 * =============================================================================
 */

import * as m from '$lib/paraglide/messages.js'
import { z } from 'zod'

/** 用户列表查询参数 Schema */
export const ListUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).default(20),
  search: z.string().optional(),
  enabled: z
    .enum(['true', 'false'])
    .transform(v => v === 'true')
    .optional(),
})

/** 创建用户请求 Schema */
export const CreateUserSchema = z.object({
  username: z.string().regex(/^\w{3,20}$/, m.api_auth_username_format_invalid()),
  email: z.string().regex(/^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/, m.api_auth_email_invalid()),
  password: z.string().min(8, m.api_auth_password_too_short()),
  display_name: z.string().optional(),
  roles: z.array(z.string()).optional(),
})

/** 更新用户请求 Schema */
export const UpdateUserSchema = z.object({
  username: z.string().regex(/^\w{3,20}$/, m.api_auth_username_format_invalid()).optional(),
  email: z.string().regex(/^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/, m.api_auth_email_invalid()).optional(),
  password: z.string().min(8).optional(),
  display_name: z.string().optional(),
  roles: z.array(z.string()).optional(),
})

/** 创建角色请求 Schema */
export const CreateRoleSchema = z.object({
  name: z.string().trim().min(1, m.api_iam_roles_name_required()),
  description: z.string().optional(),
  permissions: z.array(z.string()).optional(),
})

/** 创建权限请求 Schema */
export const CreatePermissionSchema = z.object({
  name: z.string().trim().min(1, m.api_common_required_fields()),
  description: z.string().optional(),
  resource: z.string().trim().min(1, m.api_common_required_fields()),
  action: z.string().trim().min(1, m.api_common_required_fields()),
})
