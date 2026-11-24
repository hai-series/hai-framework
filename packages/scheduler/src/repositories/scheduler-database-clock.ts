import type { ReldbFunctions } from '@h-ai/reldb'

/**
 * 返回对应数据库的执行时钟表达式，单位为 Unix 毫秒；表达式仅来自固定方言。
 * @example 模块内部上下文
 * ```ts
 * const sqliteNow = databaseClockSql('sqlite')
 * ```
 */
export function databaseClockSql(type: NonNullable<ReldbFunctions['config']>['type'] | undefined): string {
  if (type === 'postgresql')
    return 'CAST(FLOOR(EXTRACT(EPOCH FROM clock_timestamp()) * 1000) AS BIGINT)'
  if (type === 'mysql')
    return 'CAST(UNIX_TIMESTAMP(SYSDATE(3)) * 1000 AS SIGNED)'
  return 'CAST((julianday(\'now\') - 2440587.5) * 86400000 AS INTEGER)'
}
