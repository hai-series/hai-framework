/**
 * =============================================================================
 * Admin Console - 审计日志页面数据加载
 * =============================================================================
 */

import type { PageServerLoad } from './$types'
import { audit } from '@h-ai/audit'
import { core } from '@h-ai/core'
import { kit } from '@h-ai/kit'
import { error } from '@sveltejs/kit'

export const load: PageServerLoad = async ({ url, locals }) => {
  // 权限检查：system:logs
  if (!kit.guard.check(locals.session, 'system:logs')) {
    error(403, { message: 'Forbidden' })
  }

  const page = Number(url.searchParams.get('page')) || 1
  const pageSize = 20

  const listResult = await audit.list({ page, pageSize })
  if (!listResult.success) {
    core.logger.warn('Failed to fetch audit logs for admin page', { error: listResult.error.message })
    error(500, { message: 'Failed to load audit logs' })
  }

  const { items, total } = listResult.data

  return {
    logs: items,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  }
}
