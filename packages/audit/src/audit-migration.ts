/** 审计结构升级及数据库原生保留保护；旧记录未知字段保持空值。 */
import type { HaiResult } from '@h-ai/core'
import type { DmlOperations, SchemaMigration } from '@h-ai/reldb'
import type { AuditInitConfig } from './audit-config.js'
import { err, ok } from '@h-ai/core'
import { migrateSchema, reldb, schemaColumns } from '@h-ai/reldb'
import { auditM } from './audit-i18n.js'
import { HaiAuditError } from './audit-types.js'

const columns = { category: 'VARCHAR(16)', outcome: 'VARCHAR(16)', severity: 'VARCHAR(16)', request_id: 'TEXT', trace_id: 'TEXT', scope_id: 'TEXT', actor_snapshot: 'JSON' }
const triggers = ['hai_audit_protect_update', 'hai_audit_protect_delete', 'hai_audit_protect_insert']

async function existingTriggers(sql: DmlOperations): Promise<HaiResult<string[]>> {
  const result = reldb.config?.type === 'sqlite'
    ? await sql.query<{ name: string }>('SELECT name FROM sqlite_master WHERE type=\'trigger\' AND tbl_name=\'hai_audit_logs\'')
    : await sql.query<{ name: string }>(`SELECT trigger_name AS name FROM information_schema.triggers WHERE trigger_schema=${reldb.config?.type === 'mysql' ? 'DATABASE()' : 'current_schema()'} AND event_object_table='hai_audit_logs'`)
  return result.success ? ok(result.data.map(row => row.name)) : result
}

const steps: SchemaMigration[] = [{
  version: 1,
  name: 'event-context-and-identity',
  async needed(sql) {
    const found = await schemaColumns(reldb, 'hai_audit_logs', sql)
    return found.success ? ok(found.data.length > 0 && Object.keys(columns).some(name => !found.data.includes(name))) : found
  },
  async apply(sql) {
    const found = await schemaColumns(reldb, 'hai_audit_logs', sql)
    if (!found.success)
      return found
    for (const [name, definition] of Object.entries(columns)) {
      if (found.data.includes(name))
        continue
      const added = await sql.execute(`ALTER TABLE hai_audit_logs ADD COLUMN ${name} ${definition}`)
      if (!added.success)
        return added
    }
    return ok(undefined)
  },
}, {
  version: 2,
  name: 'persistent-retention-policy',
  async needed(sql) {
    const found = await schemaColumns(reldb, 'hai_audit_policy', sql)
    if (!found.success || found.data.length === 0)
      return found.success ? ok(true) : found
    const row = await sql.get<{ id: number }>('SELECT id FROM hai_audit_policy WHERE id=1')
    return row.success ? ok(!row.data) : row
  },
  async apply(sql) {
    const created = await sql.execute('CREATE TABLE IF NOT EXISTS hai_audit_policy (id INTEGER PRIMARY KEY, enabled INTEGER NOT NULL, min_days INTEGER NOT NULL)')
    if (!created.success)
      return created
    return sql.execute(reldb.config?.type === 'mysql'
      ? 'INSERT IGNORE INTO hai_audit_policy (id, enabled, min_days) VALUES (1, 0, 90)'
      : 'INSERT INTO hai_audit_policy (id, enabled, min_days) VALUES (1, 0, 90) ON CONFLICT(id) DO NOTHING')
  },
}, {
  version: 3,
  name: 'retention-write-guards',
  async needed(sql) {
    const table = await schemaColumns(reldb, 'hai_audit_logs', sql)
    if (!table.success || !table.data.length)
      return table.success ? ok(false) : table
    const found = await existingTriggers(sql)
    return found.success ? ok(triggers.some(name => !found.data.includes(name))) : found
  },
  async apply(sql) {
    const found = await existingTriggers(sql)
    if (!found.success)
      return found
    const enabled = 'COALESCE((SELECT enabled FROM hai_audit_policy WHERE id=1),1)=1'
    const days = 'COALESCE((SELECT min_days FROM hai_audit_policy WHERE id=1),90)'
    const cutoff = reldb.config?.type === 'sqlite'
      ? `CAST((julianday('now')-2440587.5)*86400000 AS INTEGER) - ${days}*86400000`
      : reldb.config?.type === 'postgresql'
        ? `CURRENT_TIMESTAMP - (${days} * INTERVAL '1 day')`
        : `TIMESTAMPADD(DAY, -${days}, CURRENT_TIMESTAMP(3))`
    const existingProtected = `${enabled} AND EXISTS(SELECT 1 FROM hai_audit_logs a WHERE a.id=NEW.id AND a.created_at >= ${cutoff})`
    if (reldb.config?.type === 'postgresql') {
      const fn = await sql.execute(`CREATE OR REPLACE FUNCTION hai_audit_protect() RETURNS trigger AS $$ BEGIN IF TG_OP='INSERT' THEN IF ${existingProtected} THEN RAISE EXCEPTION 'Audit record is protected by retention policy'; END IF; RETURN NEW; END IF; IF ${enabled} AND OLD.created_at >= ${cutoff} THEN RAISE EXCEPTION 'Audit record is protected by retention policy'; END IF; IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`)
      if (!fn.success)
        return fn
    }
    for (const [index, operation] of ['UPDATE', 'DELETE', 'INSERT'].entries()) {
      const name = triggers[index]!
      if (found.data.includes(name))
        continue
      // INSERT 冲突保护同时覆盖 SQLite 未开启递归删除触发器时的 INSERT OR REPLACE。
      const protectedRow = operation === 'INSERT' ? existingProtected : `${enabled} AND OLD.created_at >= ${cutoff}`
      const statement = reldb.config?.type === 'sqlite'
        ? `CREATE TRIGGER ${name} BEFORE ${operation} ON hai_audit_logs WHEN ${protectedRow} BEGIN SELECT RAISE(ABORT, 'Audit record is protected by retention policy'); END`
        : reldb.config?.type === 'postgresql'
          ? `CREATE TRIGGER ${name} BEFORE ${operation} ON hai_audit_logs FOR EACH ROW EXECUTE FUNCTION hai_audit_protect()`
          : `CREATE TRIGGER ${name} BEFORE ${operation} ON hai_audit_logs FOR EACH ROW BEGIN IF ${protectedRow} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Audit record is protected by retention policy'; END IF; END`
      // MySQL 的 CREATE TRIGGER 不支持服务端预处理；仍在迁移锁的同一连接执行固定 DDL。
      const created = reldb.config?.type === 'mysql' ? await sql.query(statement) : await sql.execute(statement)
      if (!created.success)
        return created
    }
    return ok(undefined)
  },
}, {
  version: 4,
  name: 'millisecond-event-time',
  async needed(sql) {
    if (reldb.config?.type !== 'mysql')
      return ok(false)
    const column = await sql.get<{ fractional_digits: number | null }>('SELECT DATETIME_PRECISION AS fractional_digits FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?', ['hai_audit_logs', 'created_at'])
    return column.success ? ok(Boolean(column.data && Number(column.data.fractional_digits ?? 0) < 3)) : column
  },
  async apply(sql) {
    // 框架旧 MySQL DATETIME(0) 会把 .800 舍入到下一秒；保留既有值并让新事件保留毫秒。
    const changed = await sql.execute('ALTER TABLE hai_audit_logs MODIFY COLUMN created_at DATETIME(3)')
    return changed.success ? ok(undefined) : changed
  },
}, {
  version: 5,
  name: 'alert-notification-claims',
  async needed(sql) {
    const found = await schemaColumns(reldb, 'hai_audit_alert_claims', sql)
    return found.success ? ok(found.data.length === 0) : found
  },
  async apply(sql) {
    // 领取在外部效果前持久化；崩溃或结果未知时不盲目重发。地址与正文不在此表保存。
    const created = await sql.execute('CREATE TABLE IF NOT EXISTS hai_audit_alert_claims (id VARCHAR(64) PRIMARY KEY, rule_id VARCHAR(64) NOT NULL, target_id VARCHAR(64) NOT NULL, window_start BIGINT NOT NULL, status VARCHAR(16) NOT NULL, queue_id VARCHAR(64), error_code VARCHAR(128))')
    return created.success ? ok(undefined) : created
  },
}, {
  version: 6,
  name: 'event-time-index',
  async needed(sql) {
    const table = await schemaColumns(reldb, 'hai_audit_logs', sql)
    if (!table.success || !table.data.length)
      return table.success ? ok(false) : table
    const found = reldb.config?.type === 'sqlite'
      ? await sql.get('SELECT name FROM sqlite_master WHERE type=\'index\' AND name=\'hai_audit_event_time_idx\'')
      : reldb.config?.type === 'postgresql'
        ? await sql.get('SELECT indexname FROM pg_indexes WHERE schemaname=current_schema() AND tablename=\'hai_audit_logs\' AND indexname=\'hai_audit_event_time_idx\'')
        : await sql.get('SELECT index_name FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=\'hai_audit_logs\' AND index_name=\'hai_audit_event_time_idx\' LIMIT 1')
    return found.success ? ok(!found.data) : found
  },
  async apply(sql) {
    const created = await sql.execute('CREATE INDEX hai_audit_event_time_idx ON hai_audit_logs (created_at)')
    return created.success ? ok(undefined) : created
  },
}]

/**
 * 只读预检或迁移审计字段、保留设置和写入保护；升级前停旧写入并备份。
 * @example
 * ```ts
 * import { migrateAudit } from '@h-ai/audit'
 * const plan = await migrateAudit({ dryRun: true }) // RelDB 已初始化；不改写记录。
 * ```
 */
export function migrateAudit(options: { dryRun?: boolean } = {}) {
  return migrateSchema(reldb, 'audit', steps, options)
}

/**
 * 仅显式配置更新持久策略；未传时保留既有保护，所有节点使用同一策略行。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * // 共享数据库与策略表已由迁移初始化。
 * const configured = await configureAuditRetention({ enabled: true, minDays: 90 })
 * if (!configured.success) configured.error.code
 * ```
 */
export async function configureAuditRetention(policy: AuditInitConfig['retention']): Promise<HaiResult<void>> {
  if (!policy)
    return ok(undefined)
  const result = await reldb.sql.execute('UPDATE hai_audit_policy SET enabled=?, min_days=? WHERE id=1', [Number(policy.enabled), policy.minDays])
  return result.success && result.data.changes === 1 ? ok(undefined) : err(HaiAuditError.CONFIG_ERROR, auditM('audit_retentionPolicyFailed'), result.success ? undefined : result.error)
}

/**
 * 清理入口从共享数据库读取最低天数，不把进程内旧配置当作保护真值。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const retained = await auditRetentionDays()
 * if (retained.success) retained.data
 * ```
 */
export async function auditRetentionDays(): Promise<HaiResult<number>> {
  const result = await reldb.sql.get<{ enabled: number, min_days: number }>('SELECT enabled, min_days FROM hai_audit_policy WHERE id=1')
  if (!result.success || !result.data || ![0, 1].includes(Number(result.data.enabled)) || !Number.isInteger(Number(result.data.min_days)) || Number(result.data.min_days) < 1)
    return err(HaiAuditError.CLEANUP_FAILED, auditM('audit_retentionPolicyFailed'))
  return ok(Number(result.data.enabled) === 1 ? Number(result.data.min_days) : 0)
}
