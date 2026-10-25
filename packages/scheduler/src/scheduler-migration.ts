/** 调度器自己升级任务与执行历史；不触发旧任务，不覆盖业务结果。 */
import type { SchemaMigration } from '@h-ai/reldb'
import { err, HaiCommonError, ok } from '@h-ai/core'
import { migrateSchema, reldb, schemaColumns } from '@h-ai/reldb'

/**
 * 预检或升级调度器表；旧日志归档并幂等复制，新版执行账本与旧历史隔离。
 * @example
 * ```ts
 * import { migrateScheduler } from '@h-ai/scheduler'
 * const plan = await migrateScheduler({ dryRun: true })
 * ```
 */
export function migrateScheduler(options: { dryRun?: boolean } = {}) {
  const steps: SchemaMigration[] = [{
    version: 1,
    name: 'explicit-task-idempotency',
    async needed(sql) {
      const columns = await schemaColumns(reldb, 'hai_scheduler_tasks', sql)
      return columns.success ? ok(columns.data.length > 0 && !columns.data.includes('idempotent')) : columns
    },
    async apply(sql) {
      return sql.execute('ALTER TABLE hai_scheduler_tasks ADD COLUMN idempotent BOOLEAN NOT NULL DEFAULT FALSE')
    },
  }, {
    version: 2,
    name: 'execution-history-snapshots',
    async needed(sql) {
      const columns = await schemaColumns(reldb, 'hai_scheduler_logs', sql)
      if (!columns.success)
        return columns
      if (columns.data.length && !columns.data.includes('payload'))
        return ok(true)
      const archive = await schemaColumns(reldb, 'hai_scheduler_logs_alpha65', sql)
      if (!archive.success)
        return archive
      if (!archive.data.length)
        return ok(false)
      if (!columns.data.length)
        return ok(true)
      // MySQL 的旧表与新表可能使用不同排序规则；迁移身份按字节精确比较。
      const identity = reldb.config?.type === 'mysql' ? 'CAST(n.id AS BINARY)=CAST(CONCAT(\'legacy:\',CAST(a.id AS CHAR)) AS BINARY)' : 'n.id=\'legacy:\' || CAST(a.id AS TEXT)'
      const missing = await sql.get(`SELECT id FROM hai_scheduler_logs_alpha65 a WHERE NOT EXISTS (SELECT 1 FROM hai_scheduler_logs n WHERE ${identity}) LIMIT 1`)
      return missing.success ? ok(Boolean(missing.data)) : missing
    },
    async apply(sql) {
      const columns = await schemaColumns(reldb, 'hai_scheduler_logs', sql)
      if (!columns.success)
        return columns
      if (columns.data.length && !columns.data.includes('payload')) {
        const archive = await schemaColumns(reldb, 'hai_scheduler_logs_alpha65', sql)
        if (!archive.success)
          return archive
        if (archive.data.length)
          return err(HaiCommonError.INIT_FAILED, 'Scheduler archive already exists')
        const renamed = await sql.execute('ALTER TABLE hai_scheduler_logs RENAME TO hai_scheduler_logs_alpha65')
        if (!renamed.success)
          return renamed
      }
      const text = reldb.config?.type === 'mysql' ? 'VARCHAR(255)' : 'TEXT'
      const json = reldb.config?.type === 'postgresql' ? 'JSONB' : reldb.config?.type === 'mysql' ? 'JSON' : 'TEXT'
      const created = await sql.execute(`CREATE TABLE IF NOT EXISTS hai_scheduler_logs (id ${text} NOT NULL,occurrence_id ${text},task_id ${text} NOT NULL,task_name ${text} NOT NULL,task_type ${text} NOT NULL,trigger_type ${text} NOT NULL,trigger_source ${text},status ${text} NOT NULL,payload ${json} NOT NULL,started_at BIGINT NOT NULL,finished_at BIGINT NOT NULL,duration INTEGER NOT NULL,CONSTRAINT pk_hai_scheduler_log_v2 PRIMARY KEY(id))`)
      if (!created.success)
        return created
      for (let offset = 0; ; offset += 100) {
        const rows = await sql.query<{ id: string, task_id: string, task_name: string, task_type: string, trigger_type: string, trigger_source: string | null, status: string, result: string | null, error: string | null, started_at: number | string, finished_at: number | string, duration: number }>(`SELECT CAST(id AS ${reldb.config?.type === 'mysql' ? 'CHAR' : 'TEXT'}) AS id,task_id,task_name,task_type,trigger_type,trigger_source,status,result,error,started_at,finished_at,duration FROM hai_scheduler_logs_alpha65 ORDER BY id LIMIT 100 OFFSET ?`, [offset])
        if (!rows.success)
          return rows
        for (const row of rows.data) {
          const id = `legacy:${row.id}`
          const existing = await sql.get('SELECT id FROM hai_scheduler_logs WHERE id=?', [id])
          if (!existing.success)
            return existing
          if (existing.data)
            continue
          const payload = { id, taskId: row.task_id, taskName: row.task_name, taskType: row.task_type, triggerType: row.trigger_type, triggerSource: row.trigger_source, status: row.status, result: row.result, error: row.error, startedAt: Number(row.started_at), finishedAt: Number(row.finished_at), duration: Number(row.duration), persistence: { status: 'persisted' } }
          const copied = await sql.execute('INSERT INTO hai_scheduler_logs(id,task_id,task_name,task_type,trigger_type,trigger_source,status,payload,started_at,finished_at,duration) VALUES(?,?,?,?,?,?,?,?,?,?,?)', [id, row.task_id, row.task_name, row.task_type, row.trigger_type, row.trigger_source, row.status, JSON.stringify(payload), row.started_at, row.finished_at, row.duration])
          if (!copied.success)
            return copied
        }
        if (rows.data.length < 100)
          return ok(undefined)
      }
    },
  }]
  return migrateSchema(reldb, 'scheduler', steps, options)
}
