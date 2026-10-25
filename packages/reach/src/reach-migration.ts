/** 发送账本升级仅处理 Reach 自己的表；旧在途消息隔离，不能猜测发送结果。 */
import type { ReldbFunctions, SchemaMigration } from '@h-ai/reldb'
import { randomUUID } from 'node:crypto'
import { ok } from '@h-ai/core'
import { migrateSchema, reldb, schemaColumns } from '@h-ai/reldb'

/**
 * 预检或升级 Reach 队列。旧凭据相关载荷清除，待发凭据丢弃，保留发送状态和历史标识。
 * @example
 * ```ts
 * import { migrateReach } from '@h-ai/reach'
 * const plan = await migrateReach({ dryRun: true })
 * ```
 */
export function migrateReach(options: { dryRun?: boolean } = {}, db: ReldbFunctions = reldb) {
  const definitions = { queue_id: db.config?.type === 'mysql' ? 'VARCHAR(255)' : 'TEXT', retry_safe: 'BOOLEAN NOT NULL DEFAULT FALSE', attempt_count: 'BIGINT NOT NULL DEFAULT 0', max_attempts: 'BIGINT NOT NULL DEFAULT 5', next_attempt_at: 'BIGINT NOT NULL DEFAULT 0', retry_delay_ms: 'BIGINT NOT NULL DEFAULT 60000', max_retry_delay_ms: 'BIGINT NOT NULL DEFAULT 3600000', last_failure: 'TEXT' }
  const steps: SchemaMigration[] = [{
    version: 1,
    name: 'durable-delivery-ledger',
    async needed(sql) {
      const found = await schemaColumns(db, 'hai_reach_send_log', sql)
      return found.success ? ok(found.data.length > 0 && Object.keys(definitions).some(name => !found.data.includes(name))) : found
    },
    async apply(sql) {
      const found = await schemaColumns(db, 'hai_reach_send_log', sql)
      if (!found.success)
        return found
      for (const [name, definition] of Object.entries(definitions)) {
        if (found.data.includes(name))
          continue
        const added = await sql.execute(`ALTER TABLE hai_reach_send_log ADD COLUMN ${name} ${definition}`)
        if (!added.success)
          return added
      }
      return ok(undefined)
    },
  }, {
    version: 2,
    name: 'legacy-delivery-isolation',
    async needed(sql) {
      const found = await schemaColumns(db, 'hai_reach_send_log', sql)
      if (!found.success || !found.data.length)
        return found.success ? ok(false) : found
      if (!found.data.includes('queue_id'))
        return ok(true)
      const row = await sql.get('SELECT id FROM hai_reach_send_log WHERE queue_id IS NULL AND status IN (\'pending\',\'processing\',\'unknown\') LIMIT 1')
      return row.success ? ok(Boolean(row.data)) : row
    },
    async apply(sql) {
      const isolated = await sql.execute('UPDATE hai_reach_send_log SET status=\'unknown\',processing_owner=NULL,locked_until=NULL WHERE status=\'processing\' AND queue_id IS NULL')
      if (!isolated.success)
        return isolated
      while (true) {
        const rows = await sql.query<{ id: number }>('SELECT id FROM hai_reach_send_log WHERE queue_id IS NULL AND status IN (\'pending\',\'unknown\') ORDER BY id LIMIT 100')
        if (!rows.success)
          return rows
        for (const row of rows.data) {
          const saved = await sql.execute('UPDATE hai_reach_send_log SET queue_id=? WHERE id=? AND queue_id IS NULL', [randomUUID(), row.id])
          if (!saved.success)
            return saved
        }
        if (rows.data.length < 100)
          return ok(undefined)
      }
    },
  }, {
    version: 3,
    name: 'credential-payload-retirement',
    async needed(sql) {
      const found = await schemaColumns(db, 'hai_reach_send_log', sql)
      if (!found.success || !found.data.length)
        return found.success ? ok(false) : found
      // 旧数据无法可靠识别正文中的任意凭据，升级一次性退役旧载荷，元数据和状态保留。
      const ledger = await schemaColumns(db, 'hai_schema_migrations', sql)
      if (!ledger.success)
        return ledger
      const version = ledger.data.length ? await sql.get<{ version: number }>('SELECT version FROM hai_schema_migrations WHERE module=?', ['reach']) : ok(null)
      if (!version.success)
        return version
      if (Number(version.data?.version ?? 0) >= 3)
        return ok(false)
      const row = await sql.get('SELECT id FROM hai_reach_send_log WHERE subject IS NOT NULL OR body IS NOT NULL OR template IS NOT NULL OR vars_json IS NOT NULL OR extra_json IS NOT NULL LIMIT 1')
      return row.success ? ok(Boolean(row.data)) : row
    },
    async apply(sql) {
      return sql.execute('UPDATE hai_reach_send_log SET body=NULL,subject=NULL,vars_json=NULL,extra_json=NULL,template=NULL,status=CASE WHEN status IN (\'pending\',\'processing\') THEN \'discarded\' WHEN status=\'sending\' THEN \'unknown\' ELSE status END,processing_owner=NULL,locked_until=NULL WHERE subject IS NOT NULL OR body IS NOT NULL OR template IS NOT NULL OR vars_json IS NOT NULL OR extra_json IS NOT NULL')
    },
  }, {
    version: 4,
    name: 'unique-operation-receipts',
    async needed(sql) {
      const columns = await schemaColumns(db, 'hai_reach_send_log', sql)
      if (!columns.success || !columns.data.length)
        return columns.success ? ok(false) : columns
      if (!columns.data.includes('queue_id'))
        return ok(true)
      if (db.config?.type === 'sqlite') {
        const indexes = await sql.query<{ name: string, unique: number }>('PRAGMA index_list(hai_reach_send_log)')
        if (!indexes.success)
          return indexes
        for (const index of indexes.data) {
          if (!index.unique || !/^\w+$/.test(index.name))
            continue
          const fields = await sql.query<{ name: string }>(`PRAGMA index_info(${index.name})`)
          if (!fields.success)
            return fields
          if (fields.data.length === 1 && fields.data[0]?.name === 'queue_id')
            return ok(false)
        }
        return ok(true)
      }
      const found = db.config?.type === 'mysql'
        ? await sql.get('SELECT index_name FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=? AND non_unique=0 GROUP BY index_name HAVING COUNT(*)=1 AND MAX(column_name)=?', ['hai_reach_send_log', 'queue_id'])
        : await sql.get('SELECT i.indexrelid FROM pg_index i JOIN pg_class t ON t.oid=i.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=ANY(i.indkey) WHERE t.relname=? AND n.nspname=current_schema() AND i.indisunique AND i.indnatts=1 AND a.attname=?', ['hai_reach_send_log', 'queue_id'])
      return found.success ? ok(!found.data) : found
    },
    async apply(sql) {
      return sql.execute('CREATE UNIQUE INDEX uq_hai_reach_queue_v1 ON hai_reach_send_log(queue_id)')
    },
  }]
  return migrateSchema(db, 'reach', steps, options)
}
