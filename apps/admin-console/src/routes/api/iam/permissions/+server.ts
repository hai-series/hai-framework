/**
 * =============================================================================
 * Admin Console - 权限管理 API
 * =============================================================================
 */

import type { RequestHandler } from '@sveltejs/kit'
import { audit, permissionService } from '$lib/server/services/index.js'
import { json } from '@sveltejs/kit'

/**
 * GET /api/iam/permissions - 获取权限列表
 */
export const GET: RequestHandler = async () => {
  try {
    const permissions = await permissionService.list()
    return json({ success: true, data: permissions })
  }
  catch (error) {
    console.error('获取权限列表失败:', error)
    return json({ success: false, error: '获取权限列表失败' }, { status: 500 })
  }
}

/**
 * POST /api/iam/permissions - 创建权限
 */
export const POST: RequestHandler = async ({ request, locals, getClientAddress }) => {
  try {
    const body = await request.json()
    const { name, description, resource, action } = body as {
      name: string
      description?: string
      resource: string
      action: string
    }

    // 验证必填字段
    if (!name?.trim() || !resource?.trim() || !action?.trim()) {
      return json({ success: false, error: '请填写所有必填字段' }, { status: 400 })
    }

    // 生成权限 code
    const code = `${resource}:${action}`

    // 检查权限名称是否已存在
    const existing = await permissionService.getByName(code)
    if (existing) {
      return json({ success: false, error: '权限名称已存在' }, { status: 409 })
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
    await audit.crud(
      locals.session?.userId ?? null,
      'create',
      'permission',
      permission.id,
      { name, resource, action },
      ip,
      ua,
    )

    return json({ success: true, data: permission })
  }
  catch (error) {
    console.error('创建权限失败:', error)
    return json({ success: false, error: '创建权限失败' }, { status: 500 })
  }
}
