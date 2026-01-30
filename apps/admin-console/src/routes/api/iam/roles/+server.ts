/**
 * =============================================================================
 * Admin Console - 角色管理 API
 * =============================================================================
 */

import type { RequestHandler } from '@sveltejs/kit'
import { audit, permissionService, roleService } from '$lib/server/services/index.js'
import { json } from '@sveltejs/kit'

/**
 * GET /api/iam/roles - 获取角色列表
 */
export const GET: RequestHandler = async () => {
  try {
    const roles = await roleService.list()
    return json({ success: true, data: roles })
  }
  catch (error) {
    console.error('获取角色列表失败:', error)
    return json({ success: false, error: '获取角色列表失败' }, { status: 500 })
  }
}

/**
 * POST /api/iam/roles - 创建角色
 */
export const POST: RequestHandler = async ({ request, locals, getClientAddress }) => {
  try {
    const body = await request.json()
    const { name, description, permissions } = body as {
      name: string
      description?: string
      permissions?: string[]
    }

    // 验证必填字段
    if (!name?.trim()) {
      return json({ success: false, error: '请输入角色名称' }, { status: 400 })
    }

    // 生成角色 code（将名称转为 snake_case）
    const code = `role_${name.toLowerCase().replace(/\s+/g, '_')}`

    // 转换权限名称为 ID
    const permissionIds: string[] = []
    if (permissions?.length) {
      for (const permName of permissions) {
        const perm = await permissionService.getByName(permName)
        if (perm) {
          permissionIds.push(perm.id)
        }
      }
    }

    // 创建角色
    const role = await roleService.create({
      code,
      name,
      description,
      permissions: permissionIds,
    })

    // 记录审计日志
    const ip = getClientAddress()
    const ua = request.headers.get('user-agent') ?? undefined
    await audit.crud(
      locals.session?.userId ?? null,
      'create',
      'role',
      role.id,
      { name, permissions },
      ip,
      ua,
    )

    return json({ success: true, data: role })
  }
  catch (error) {
    console.error('创建角色失败:', error)
    return json({ success: false, error: '创建角色失败' }, { status: 500 })
  }
}
