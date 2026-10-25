import { reldb } from '@h-ai/reldb'
import { expect, it } from 'vitest'
import { defineDbSuite, mysqlEnv, postgresEnv, sqliteMemoryEnv } from '../../reldb/tests/helpers/reldb-test-suite.js'
import { migrateScheduler } from '../src/index.js'

for (const [name, setup] of [['sqlite', sqliteMemoryEnv], ['postgresql', postgresEnv], ['mysql', mysqlEnv]] as const) {
  defineDbSuite(name, setup, () => {
    it('旧任务及超过一批的历史迁移后仍可读取，归档保留且重启不重复复制', async () => {
      for (const table of ['hai_scheduler_logs_alpha65', 'hai_scheduler_logs', 'hai_scheduler_tasks', 'hai_schema_migrations'])
        expect((await reldb.ddl.dropTable(table)).success).toBe(true)
      expect((await reldb.ddl.createTable('hai_scheduler_tasks', { id: { type: 'TEXT', primaryKey: true }, name: { type: 'TEXT' } })).success).toBe(true)
      await reldb.sql.execute('INSERT INTO hai_scheduler_tasks VALUES (?,?)', ['old-task', 'Kept task'])
      await reldb.sql.execute('CREATE TABLE hai_scheduler_logs (id INTEGER PRIMARY KEY,task_id TEXT,task_name TEXT,task_type TEXT,trigger_type TEXT,trigger_source TEXT,status TEXT,result TEXT,error TEXT,started_at BIGINT,finished_at BIGINT,duration INTEGER)')
      for (let id = 1; id <= 105; id++)
        await reldb.sql.execute('INSERT INTO hai_scheduler_logs VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [id, 'old-task', 'Kept task', 'hook', 'manual', null, 'success', `result-${id}`, null, 1000, 1001, 1])
      expect(await migrateScheduler({ dryRun: true })).toMatchObject({ success: true, data: { changes: ['explicit-task-idempotency', 'execution-history-snapshots'] } })
      expect((await migrateScheduler()).success).toBe(true)
      expect((await migrateScheduler()).success).toBe(true)
      const count = await reldb.sql.get('SELECT COUNT(*) AS count FROM hai_scheduler_logs')
      expect(count.success && Number(count.data?.count)).toBe(105)
      const archiveCount = await reldb.sql.get('SELECT COUNT(*) AS count FROM hai_scheduler_logs_alpha65')
      expect(archiveCount.success && Number(archiveCount.data?.count)).toBe(105)
      const row = await reldb.sql.get<{ payload: string }>('SELECT payload FROM hai_scheduler_logs WHERE id=?', ['legacy:105'])
      expect(row.success && (typeof row.data!.payload === 'string' ? JSON.parse(row.data!.payload) : row.data!.payload)).toMatchObject({ id: 'legacy:105', result: 'result-105', persistence: { status: 'persisted' } })
      const task = await reldb.sql.get('SELECT * FROM hai_scheduler_tasks')
      expect(task.success && task.data?.id).toBe('old-task')
      expect(task.success && Number(task.data?.idempotent)).toBe(0)
    })
  }, { database: reldb })
}
