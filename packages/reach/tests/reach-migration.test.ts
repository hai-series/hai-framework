import { reldb } from '@h-ai/reldb'
import { expect, it } from 'vitest'
import { defineDbSuite, mysqlEnv, postgresEnv, sqliteMemoryEnv } from '../../reldb/tests/helpers/reldb-test-suite.js'
import { migrateReach } from '../src/index.js'

for (const [name, setup] of [['sqlite', sqliteMemoryEnv], ['postgresql', postgresEnv], ['mysql', mysqlEnv]] as const) {
  defineDbSuite(name, setup, () => {
    it('升级旧发送表保留结果、隔离在途并退役载荷，新幂等键受到唯一约束', async () => {
      for (const table of ['hai_reach_send_log', 'hai_schema_migrations'])
        expect((await reldb.ddl.dropTable(table)).success).toBe(true)
      await reldb.sql.execute('CREATE TABLE hai_reach_send_log (id INTEGER PRIMARY KEY,provider TEXT,to_addr TEXT,subject TEXT,body TEXT,template TEXT,vars_json TEXT,extra_json TEXT,status TEXT,message_id TEXT,processing_owner TEXT,locked_until BIGINT,created_at BIGINT,updated_at BIGINT)')
      for (const [id, status] of ['sent', 'processing', 'pending'].entries())
        await reldb.sql.execute('INSERT INTO hai_reach_send_log VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [id, 'email', 'alice', 'OTP', 'OLD_CREDENTIAL_SENTINEL', null, '{"code":"OLD_CREDENTIAL_SENTINEL"}', null, status, 'old-result', null, 0, 1, 1])
      expect((await migrateReach({ dryRun: true })).success).toBe(true)
      expect((await migrateReach()).success).toBe(true)
      expect((await migrateReach()).success).toBe(true)
      const rows = await reldb.sql.query('SELECT * FROM hai_reach_send_log ORDER BY id')
      expect(rows.success && rows.data.map(row => row.status)).toEqual(['sent', 'unknown', 'discarded'])
      expect(JSON.stringify(rows)).not.toContain('OLD_CREDENTIAL_SENTINEL')
      expect(await reldb.sql.execute('UPDATE hai_reach_send_log SET queue_id=? WHERE id=?', ['one-operation', 0])).toMatchObject({ success: true })
      expect((await reldb.sql.execute('UPDATE hai_reach_send_log SET queue_id=? WHERE id=?', ['one-operation', 1])).success).toBe(false)
    })
  }, { database: reldb })
}
