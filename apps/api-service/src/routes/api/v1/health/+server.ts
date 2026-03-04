/**
 * 健康检查接口 — 报告各模块状态
 */

import { cache } from '@h-ai/cache'
import { kit } from '@h-ai/kit'
import { reldb } from '@h-ai/reldb'

export const GET = kit.handler(async () => {
  const checks: Record<string, string> = {}

  // 数据库检查
  try {
    const dbResult = await reldb.sql.get('SELECT 1')
    checks.database = dbResult.success ? 'ok' : 'error'
  }
  catch {
    checks.database = 'error'
  }

  // 缓存检查
  try {
    await cache.kv.set('health:ping', 'pong', { ex: 5 })
    const val = await cache.kv.get('health:ping')
    checks.cache = (val.success && val.data === 'pong') ? 'ok' : 'error'
  }
  catch {
    checks.cache = 'error'
  }

  const allOk = Object.values(checks).every(v => v === 'ok')

  return kit.response.ok({
    status: allOk ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
    checks,
  })
})
