/** 安装当前审计保留策略、数据库写保护和通知领取表。 */
import type { HaiResult } from '@h-ai/core'
import type { DmlOperations } from '@h-ai/reldb'
import type { AuditInitConfig } from './audit-config.js'
import { err, ok } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { auditM } from './audit-i18n.js'
import { HaiAuditError } from './audit-types.js'

const mysqlLock = 'SHA2(CONCAT(DATABASE(), \':hai_audit_policy\'), 256)'
const triggerOperations = [
  ['hai_audit_protect_update', 'UPDATE'],
  ['hai_audit_protect_delete', 'DELETE'],
  ['hai_audit_protect_insert', 'INSERT'],
] as const

async function installTriggers(sql: DmlOperations): Promise<HaiResult<void>> {
  const type = reldb.config?.type
  const existing = type === 'sqlite'
    ? await sql.query<{ name: string }>('SELECT name FROM sqlite_master WHERE type=\'trigger\' AND tbl_name=\'hai_audit_logs\'')
    : await sql.query<{ name: string }>(`SELECT trigger_name AS name FROM information_schema.triggers WHERE trigger_schema=${
        type === 'mysql'
          ? 'DATABASE()'
          : 'current_schema()'} AND event_object_table='hai_audit_logs'`)
  if (!existing.success)
    return existing
  const names = new Set(existing.data.map(row => row.name))
  const missing = triggerOperations.filter(([name]) => !names.has(name))
  if (!missing.length)
    return ok(undefined)

  const enabled = 'COALESCE((SELECT enabled FROM hai_audit_policy WHERE id=1),1)=1'
  const days = 'COALESCE((SELECT min_days FROM hai_audit_policy WHERE id=1),90)'
  const cutoff = type === 'sqlite'
    ? `CAST((julianday('now')-2440587.5)*86400000 AS INTEGER) - ${days}*86400000`
    : type === 'postgresql'
      ? `CURRENT_TIMESTAMP - (${days} * INTERVAL '1 day')`
      : `TIMESTAMPADD(DAY, -${days}, CURRENT_TIMESTAMP(3))`
  const existingProtected = `${enabled} AND EXISTS(SELECT 1 FROM hai_audit_logs a WHERE a.id=NEW.id AND a.created_at >= ${cutoff})`
  if (type === 'postgresql') {
    const fn = await sql.execute(`CREATE OR REPLACE FUNCTION hai_audit_protect() RETURNS trigger AS $$ BEGIN IF TG_OP='INSERT' THEN IF ${existingProtected} THEN RAISE EXCEPTION 'Audit record is protected by retention policy'; END IF; RETURN NEW; END IF; IF ${enabled} AND OLD.created_at >= ${cutoff} THEN RAISE EXCEPTION 'Audit record is protected by retention policy'; END IF; IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`)
    if (!fn.success)
      return fn
  }
  for (const [name, operation] of missing) {
    // INSERT 冲突保护覆盖 SQLite 的 INSERT OR REPLACE。
    const protectedRow = operation === 'INSERT'
      ? existingProtected
      : `${enabled} AND OLD.created_at >= ${cutoff}`
    const prefix = `CREATE TRIGGER ${name} BEFORE ${operation} ON hai_audit_logs`
    const statement = type === 'sqlite'
      ? `${prefix} WHEN ${protectedRow} BEGIN SELECT RAISE(ABORT, 'Audit record is protected by retention policy'); END`
      : type === 'postgresql'
        ? `${prefix} FOR EACH ROW EXECUTE FUNCTION hai_audit_protect()`
        : `${prefix} FOR EACH ROW BEGIN IF ${protectedRow} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Audit record is protected by retention policy'; END IF; END`
    // MySQL 的 CREATE TRIGGER 通过文本协议在持锁连接执行。
    const created = type === 'mysql'
      ? await sql.query(statement)
      : await sql.execute(statement)
    if (!created.success)
      return created
  }
  return ok(undefined)
}

async function installTimeIndex(sql: DmlOperations): Promise<HaiResult<unknown>> {
  if (reldb.config?.type !== 'mysql')
    return sql.execute('CREATE INDEX IF NOT EXISTS hai_audit_event_time_idx ON hai_audit_logs (created_at)')
  const index = await sql.get('SELECT index_name FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=? AND index_name=? LIMIT 1', ['hai_audit_logs', 'hai_audit_event_time_idx'])
  if (!index.success)
    return index
  return index.data
    ? ok(undefined)
    : sql.execute('CREATE INDEX hai_audit_event_time_idx ON hai_audit_logs (created_at)')
}

/**
 * 在发布审计仓库前准备当前表、约束及触发器。
 * @example 模块内部上下文
 * ```ts
 * const initialized = await initializeAuditStorage()
 * if (!initialized.success) throw new Error(initialized.error.message)
 * ```
 */
export async function initializeAuditStorage(): Promise<HaiResult<void>> {
  const policy = await reldb.sql.execute('CREATE TABLE IF NOT EXISTS hai_audit_policy (id INTEGER PRIMARY KEY, enabled INTEGER NOT NULL, min_days INTEGER NOT NULL)')
  if (!policy.success)
    return policy
  const claims = await reldb.sql.execute('CREATE TABLE IF NOT EXISTS hai_audit_alert_claims (id VARCHAR(64) PRIMARY KEY, rule_id VARCHAR(64) NOT NULL, target_id VARCHAR(64) NOT NULL, window_start BIGINT NOT NULL, status VARCHAR(16) NOT NULL, queue_id VARCHAR(64), error_code VARCHAR(128))')
  if (!claims.success)
    return claims
  const mysql = reldb.config?.type === 'mysql'
  const seeded = await reldb.sql.execute(mysql
    ? 'INSERT INTO hai_audit_policy (id, enabled, min_days) VALUES (1, 0, 90) ON DUPLICATE KEY UPDATE id=id'
    : 'INSERT INTO hai_audit_policy (id, enabled, min_days) VALUES (1, 0, 90) ON CONFLICT(id) DO NOTHING')
  if (!seeded.success)
    return seeded

  const started = await reldb.tx.begin()
  if (!started.success)
    return started
  const tx = started.data
  let namedLock = false
  try {
    if (mysql) {
      // MySQL DDL 会隐式提交，命名锁始终由同一连接持有。
      const lock = await tx.get<{ acquired: number }>(`SELECT GET_LOCK(${mysqlLock}, 30) AS acquired`)
      if (!lock.success)
        return lock
      if (Number(lock.data?.acquired) !== 1)
        return err(HaiAuditError.CONFIG_ERROR, auditM('audit_retentionPolicyFailed'))
      namedLock = true
    }
    else {
      const lock = await tx.execute('UPDATE hai_audit_policy SET id=id WHERE id=1')
      if (!lock.success)
        return lock
    }
    const retained = await auditRetentionDays(tx)
    if (!retained.success)
      return retained
    const triggers = await installTriggers(tx)
    if (!triggers.success)
      return triggers
    const index = await installTimeIndex(tx)
    if (!index.success)
      return index
    if (namedLock) {
      const released = await tx.get(`SELECT RELEASE_LOCK(${mysqlLock})`)
      if (!released.success)
        return released
      namedLock = false
    }
    return await tx.commit()
  }
  finally {
    if (namedLock)
      await tx.get(`SELECT RELEASE_LOCK(${mysqlLock})`)
    await tx.rollback()
  }
}

/**
 * 显式配置更新共享策略行，未提供配置时沿用数据库中的值。
 * @example 模块内部上下文
 * ```ts
 * const configured = await configureAuditRetention({ enabled: true, minDays: 90 })
 * if (!configured.success) throw new Error(configured.error.message)
 * ```
 */
export async function configureAuditRetention(policy: AuditInitConfig['retention']): Promise<HaiResult<void>> {
  if (!policy)
    return ok(undefined)
  const result = await reldb.sql.execute('UPDATE hai_audit_policy SET enabled=?, min_days=? WHERE id=1', [
    Number(policy.enabled),
    policy.minDays,
  ])
  return result.success && result.data.changes === 1
    ? ok(undefined)
    : err(HaiAuditError.CONFIG_ERROR, auditM('audit_retentionPolicyFailed'), result.success ? undefined : result.error)
}

/**
 * 清理时从数据库获取当前有效的最低保留天数。
 * @example 模块内部上下文
 * ```ts
 * const retention = await auditRetentionDays()
 * if (!retention.success) throw new Error(retention.error.message)
 * ```
 */
export async function auditRetentionDays(sql: DmlOperations = reldb.sql): Promise<HaiResult<number>> {
  const result = await sql.get<{ enabled: number, min_days: number }>('SELECT enabled, min_days FROM hai_audit_policy WHERE id=1')
  if (!result.success || !result.data || ![0, 1].includes(Number(result.data.enabled)) || !Number.isInteger(Number(result.data.min_days)) || Number(result.data.min_days) < 1)
    return err(HaiAuditError.CLEANUP_FAILED, auditM('audit_retentionPolicyFailed'), result.success ? undefined : result.error)
  return ok(Number(result.data.enabled) === 1
    ? Number(result.data.min_days)
    : 0)
}
