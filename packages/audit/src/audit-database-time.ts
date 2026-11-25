/** 审计写入、归档截止和告警窗口共用数据库时钟，不使用各节点系统时间作为共享真值。 */

import type { HaiResult } from '@h-ai/core'
import type { DmlOperations } from '@h-ai/reldb'
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { auditM } from './audit-i18n.js'
import { HaiAuditError } from './audit-types.js'

/**
 * 仅由已初始化的数据库类型选择固定 SQL，返回 UTC Unix 毫秒。
 * MySQL 取语句起点；判断领取期限时，须先持有行锁再执行带时钟条件的更新。
 * @example 模块内部上下文
 * ```ts
 * const expression = auditClockSql() // RelDB 已初始化。
 * const result = await reldb.sql.get(`SELECT ${expression} AS now_ms`)
 * if (!result.success) result.error.code
 * ```
 */
export function auditClockSql(): string {
  return reldb.config?.type === 'sqlite'
    ? 'CAST(ROUND((julianday(\'now\')-2440587.5)*86400000) AS INTEGER)'
    : reldb.config?.type === 'postgresql'
      ? 'CAST(FLOOR(EXTRACT(EPOCH FROM clock_timestamp())*1000) AS BIGINT)'
      : 'TIMESTAMPDIFF(MICROSECOND, \'1970-01-01 00:00:00\', UTC_TIMESTAMP(3)) DIV 1000'
}

/**
 * 在调用者当前连接/事务读取存储端毫秒时刻；异常由调用的业务边界转换。
 * @example 模块内部上下文
 * ```ts
 * const time = await readAuditTime() // RelDB 已初始化。
 * if (time.success) time.data.toISOString()
 * ```
 */
export async function readAuditTime(sql: DmlOperations = reldb.sql): Promise<HaiResult<Date>> {
  const result = await sql.get<{ now_ms: number | string }>(`SELECT ${auditClockSql()} AS now_ms`)
  if (!result.success)
    return core.err(HaiAuditError.LOG_FAILED, auditM('audit_eventTimeUnavailable'), result.error)
  const raw = result.data?.now_ms
  const value = typeof raw === 'number' || (typeof raw === 'string' && /^\d+$/.test(raw))
    ? Number(raw)
    : Number.NaN
  if (!Number.isSafeInteger(value) || value < 0 || !Number.isFinite(new Date(value).getTime()))
    return core.err(HaiAuditError.LOG_FAILED, auditM('audit_eventTimeUnavailable'))
  return core.ok(new Date(value))
}
