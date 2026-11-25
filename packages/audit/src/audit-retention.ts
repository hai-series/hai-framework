/** 准备审计的数据库写保护、时间索引和通知领取表。 */

import type { HaiResult } from '@h-ai/core'
import type { DmlOperations } from '@h-ai/reldb'
import type { AuditInitConfig } from './audit-config.js'
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { auditClockSql } from './audit-database-time.js'
import { auditM } from './audit-i18n.js'
import { HaiAuditError } from './audit-types.js'

const logger = core.logger.child({ module: 'audit', scope: 'retention' })
const mysqlLock = 'SHA2(CONCAT(DATABASE(), \':hai:audit:schema\'), 256)'
const dayMs = 86400_000
const triggerOperations = ['UPDATE', 'DELETE', 'INSERT'] as const
const managedTrigger = /^hai_audit_retention_(?:update|delete|insert)_([1-9]\d{0,4})$/

function initializationCanceled(): HaiResult<never> {
  return core.err(HaiAuditError.NOT_INITIALIZED, auditM('audit_notInitialized'))
}

async function syncRetentionTriggers(
  sql: DmlOperations,
  retention: AuditInitConfig['retention'],
  isCurrent: () => boolean,
): Promise<HaiResult<void>> {
  const type = reldb.config?.type
  const existing = type === 'sqlite'
    ? await sql.query<{ name: string }>('SELECT name FROM sqlite_master WHERE type=\'trigger\' AND tbl_name=\'hai_audit_logs\'')
    : await sql.query<{ name: string }>(`SELECT trigger_name AS name FROM information_schema.triggers WHERE trigger_schema=${
        type === 'mysql'
          ? 'DATABASE()'
          : 'current_schema()'} AND event_object_table='hai_audit_logs'`)
  if (!existing.success)
    return existing
  if (!isCurrent())
    return initializationCanceled()

  // 只管理当前格式中由框架生成的触发器名，保留部署自行设置的触发器。
  const installed = new Set<string>()
  for (const { name } of existing.data) {
    const match = managedTrigger.exec(name)
    if (match && match[0] === name && Number(match[1]) <= 36500)
      installed.add(name)
  }
  const desired = new Map<string, (typeof triggerOperations)[number]>(retention.enabled
    ? triggerOperations.map(operation => [
        `hai_audit_retention_${operation.toLowerCase()}_${retention.minDays}`,
        operation,
      ] as const)
    : [])
  const missing = [...desired].filter(([name]) => !installed.has(name))
  const stale = [...installed].filter(name => !desired.has(name))

  if (type === 'postgresql' && missing.length > 0) {
    const fn = await sql.execute(`
      CREATE OR REPLACE FUNCTION hai_audit_enforce_retention() RETURNS trigger
      LANGUAGE plpgsql AS $function$
      DECLARE cutoff BIGINT := (${auditClockSql()}) - TG_ARGV[0]::BIGINT;
      BEGIN
        IF TG_OP = 'INSERT' THEN
          IF EXISTS(SELECT 1 FROM hai_audit_logs a WHERE a.id=NEW.id AND a.created_at >= cutoff) THEN
            RAISE EXCEPTION 'Audit record is protected by retention policy';
          END IF;
          RETURN NEW;
        END IF;
        IF OLD.created_at >= cutoff THEN
          RAISE EXCEPTION 'Audit record is protected by retention policy';
        END IF;
        IF TG_OP = 'DELETE' THEN
          RETURN OLD;
        END IF;
        RETURN NEW;
      END;
      $function$
    `)
    if (!fn.success)
      return fn
  }

  // 保留天数来自已通过 Schema 校验的整数；用固定生成的标识符和时钟表达式生成 DDL。
  const duration = retention.minDays * dayMs
  const cutoff = `(${auditClockSql()}) - ${duration}`
  for (const [name, operation] of missing) {
    if (!isCurrent())
      return initializationCanceled()
    // INSERT 冲突保护覆盖 SQLite 的 INSERT OR REPLACE。
    const protectedRow = operation === 'INSERT'
      ? `EXISTS(SELECT 1 FROM hai_audit_logs a WHERE a.id=NEW.id AND a.created_at >= ${cutoff})`
      : `OLD.created_at >= ${cutoff}`
    const prefix = `CREATE TRIGGER ${name} BEFORE ${operation} ON hai_audit_logs`
    const statement = type === 'sqlite'
      ? `${prefix} WHEN ${protectedRow} BEGIN SELECT RAISE(ABORT, 'Audit record is protected by retention policy'); END`
      : type === 'postgresql'
        ? `${prefix} FOR EACH ROW EXECUTE FUNCTION hai_audit_enforce_retention('${duration}')`
        : `${prefix} FOR EACH ROW BEGIN IF ${protectedRow} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Audit record is protected by retention policy'; END IF; END`
    const created = type === 'mysql'
      ? await sql.query(statement)
      : await sql.execute(statement)
    if (!created.success)
      return created
  }

  if (!isCurrent())
    return initializationCanceled()

  // MySQL DDL 会隐式提交。整组新保护准备完毕后才移除旧组；一旦开始移除，就在锁内完成切换。
  for (const name of stale) {
    const removed = type === 'mysql'
      ? await sql.query(`DROP TRIGGER ${name}`)
      : await sql.execute(type === 'postgresql'
          ? `DROP TRIGGER ${name} ON hai_audit_logs`
          : `DROP TRIGGER ${name}`)
    if (!removed.success)
      return removed
  }
  return core.ok(undefined)
}

async function installTimeIndex(sql: DmlOperations): Promise<HaiResult<unknown>> {
  if (reldb.config?.type !== 'mysql')
    return sql.execute('CREATE INDEX IF NOT EXISTS hai_audit_event_time_idx ON hai_audit_logs (created_at)')
  const index = await sql.get('SELECT index_name FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=? AND index_name=? LIMIT 1', ['hai_audit_logs', 'hai_audit_event_time_idx'])
  if (!index.success)
    return index
  return index.data
    ? core.ok(undefined)
    : sql.execute('CREATE INDEX hai_audit_event_time_idx ON hai_audit_logs (created_at)')
}

function prepareAlertClaims(sql: DmlOperations): Promise<HaiResult<unknown>> {
  return sql.execute('CREATE TABLE IF NOT EXISTS hai_audit_alert_claims (id VARCHAR(64) PRIMARY KEY, rule_id VARCHAR(64) NOT NULL, target_id VARCHAR(64) NOT NULL, window_start BIGINT NOT NULL, status VARCHAR(16) NOT NULL, queue_id VARCHAR(64), error_code VARCHAR(128))')
}

/** 用独立的 PL/pgSQL 异常边界隔离可选身份查询，同时保留调用者事务的可见性。 */
function installActorLookup(sql: DmlOperations) {
  return sql.execute(`
    CREATE OR REPLACE FUNCTION hai_audit_lookup_actor(
      user_table TEXT, user_id_column TEXT, user_name_column TEXT, actor_id TEXT
    ) RETURNS TABLE(username JSONB, sql_state TEXT)
    LANGUAGE plpgsql SECURITY INVOKER AS $function$
    BEGIN
      EXECUTE format('SELECT to_jsonb(%I) FROM %I WHERE %I::text = $1', user_name_column, user_table, user_id_column)
        INTO username USING actor_id;
      RETURN NEXT;
    EXCEPTION WHEN undefined_table OR undefined_column OR insufficient_privilege THEN
      username := NULL;
      sql_state := SQLSTATE;
      RETURN NEXT;
    END;
    $function$
  `)
}

async function releaseMysqlLock(sql: DmlOperations): Promise<HaiResult<void>> {
  const released = await sql.get<{ released: number }>(`SELECT RELEASE_LOCK(${mysqlLock}) AS released`)
  if (!released.success)
    return released
  return Number(released.data?.released) === 1
    ? core.ok(undefined)
    : core.err(HaiAuditError.CONFIG_ERROR, auditM('audit_schemaLockFailed'))
}

/**
 * 在发布审计仓库前准备领取表、时间索引，并同步配置指定的数据库写保护。
 * @example 模块内部上下文
 * ```ts
 * const ready = await initializeAuditStorage({ enabled: true, minDays: 90 }, () => true)
 * if (!ready.success) throw new Error(ready.error.message)
 * ```
 */
export async function initializeAuditStorage(
  retention: AuditInitConfig['retention'],
  isCurrent: () => boolean,
): Promise<HaiResult<void>> {
  if (!isCurrent())
    return initializationCanceled()

  if (reldb.config?.type === 'postgresql') {
    return reldb.prepareSchema('hai:audit:schema', async ({ sql, ddl }) => {
      if (!isCurrent())
        return initializationCanceled()
      const prepared = await prepareAlertClaims(sql)
      if (!prepared.success)
        return prepared
      const actorLookup = await installActorLookup(sql)
      if (!actorLookup.success)
        return actorLookup
      const index = await ddl.createIndex('hai_audit_logs', 'hai_audit_event_time_idx', {
        columns: ['created_at'],
      })
      if (!index.success)
        return index
      const triggers = await syncRetentionTriggers(sql, retention, isCurrent)
      return triggers.success && !isCurrent()
        ? initializationCanceled()
        : triggers
    })
  }

  const mysql = reldb.config?.type === 'mysql'
  const started = await reldb.tx.begin()
  if (!started.success)
    return started
  const tx = started.data
  let namedLock = false
  let commitStarted = false
  try {
    if (!isCurrent())
      return initializationCanceled()
    if (mysql) {
      // MySQL DDL 会隐式提交，命名锁始终由同一连接持有。
      const lock = await tx.get<{ acquired: number }>(`SELECT GET_LOCK(${mysqlLock}, 30) AS acquired`)
      if (!lock.success)
        return lock
      if (Number(lock.data?.acquired) !== 1)
        return core.err(HaiAuditError.CONFIG_ERROR, auditM('audit_schemaLockFailed'))
      namedLock = true
    }
    else {
      // SQLite 的延迟事务须先取得写锁，再读取 sqlite_master，避免读快照升级为写入时冲突。
      const lock = await tx.execute('UPDATE hai_audit_logs SET created_at=created_at WHERE 0')
      if (!lock.success)
        return lock
    }
    if (!isCurrent())
      return initializationCanceled()

    const prepared = await prepareAlertClaims(tx)
    if (!prepared.success)
      return prepared
    const index = await installTimeIndex(tx)
    if (!index.success)
      return index
    const triggers = await syncRetentionTriggers(tx, retention, isCurrent)
    if (!triggers.success)
      return triggers
    if (namedLock) {
      const released = await releaseMysqlLock(tx)
      if (!released.success)
        return released
      namedLock = false
    }
    if (!isCurrent())
      return initializationCanceled()
    commitStarted = true
    return await tx.commit()
  }
  finally {
    if (namedLock) {
      const released = await releaseMysqlLock(tx)
      if (!released.success)
        logger.error('Audit schema lock release failed', { error: released.error })
    }
    if (!commitStarted) {
      const rolledBack = await tx.rollback()
      if (!rolledBack.success)
        logger.error('Audit schema transaction rollback failed', { error: rolledBack.error })
    }
  }
}
