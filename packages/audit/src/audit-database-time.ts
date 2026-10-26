/** 审计写入、归档截止和告警窗口共用数据库时钟，不使用各节点系统时间作为共享真值。 */
import type { HaiResult } from '@h-ai/core'
import type { DmlOperations } from '@h-ai/reldb'
import { err, ok } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { auditM } from './audit-i18n.js'
import { HaiAuditError } from './audit-types.js'

/**
 * 仅由已初始化的数据库类型选择固定 SQL，绝不接受配置 SQL。
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
    : reldb.config?.type === 'postgresql' ? 'CAST(EXTRACT(EPOCH FROM clock_timestamp())*1000 AS BIGINT)' : 'CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS SIGNED)'
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
    return err(HaiAuditError.LOG_FAILED, auditM('audit_eventTimeUnavailable'), result.error)
  const value = Number(result.data?.now_ms)
  if (!Number.isSafeInteger(value) || value < 0 || !Number.isFinite(new Date(value).getTime()))
    return err(HaiAuditError.LOG_FAILED, auditM('audit_eventTimeUnavailable'))
  return ok(new Date(value))
}
