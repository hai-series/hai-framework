import { reldb } from '@h-ai/reldb'

/**
 * 租约条件在数据库真正执行时取时钟，避免工作节点时差及行锁等待跨过截止时间。
 * @example 模块内部上下文
 * ```ts
 * const condition = `lease_until > ${feedbackClockSql()}`
 * void condition
 * ```
 */
export function feedbackClockSql(): string {
  if (reldb.config?.type === 'postgresql')
    return '(FLOOR(EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint)'
  if (reldb.config?.type === 'mysql')
    return '(CAST(UNIX_TIMESTAMP(SYSDATE(3)) * 1000 AS UNSIGNED))'
  return '(CAST((julianday(\'now\') - 2440587.5) * 86400000 AS INTEGER))'
}
