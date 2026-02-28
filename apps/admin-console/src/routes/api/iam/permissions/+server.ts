/**
 * =============================================================================
 * Admin Console - 权限管理 API
 * =============================================================================
 */

import * as m from '$lib/paraglide/messages.js'
import { CreatePermissionSchema } from '$lib/server/schemas/index.js'
import { permissionService } from '$lib/server/services/index.js'
import { audit } from '@h-ai/audit'
import { kit } from '@h-ai/kit'

/**
 * GET /api/iam/permissions - 获取权限列表
 *
 * 需要权限：permission:read
 */
export const GET = kit.handler(async ({ locals }) => {
  kit.guard.requirePermission(locals.session, 'permission:read')

  const permissions = await permissionService.list()
  return kit.response.ok(permissions)
})

/**
 * POST /api/iam/permissions - 创建权限
 *
 * 需要权限：permission:manage
 */
export const POST = kit.handler(async ({ request, locals, getClientAddress }) => {
  kit.guard.requirePermission(locals.session, 'permission:manage')

  const { name, description, resource, action } = await kit.validate.formOrFail(request, CreatePermissionSchema)

  // 生成权限 code
  const code = `${resource}:${action}`

  // 检查权限名称是否已存在
  const existing = await permissionService.getByName(code)
  if (existing) {
    return kit.response.conflict(m.api_iam_permissions_name_exists())
  }

  // 创建权限
  const permission = await permissionService.create({
    code,
    name,
    description,
    resource,
    action,
  })

  // 记录审计日志
  const ip = getClientAddress()
  const ua = request.headers.get('user-agent') ?? undefined
  await audit.helper.crud(
    locals.session?.userId ?? null,
    'create',
    'permission',
    permission.id,
    { name, resource, action },
    ip,
    ua,
  )

  return kit.response.ok(permission)
})
