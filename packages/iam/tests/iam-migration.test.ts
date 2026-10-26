import { reldb, schemaColumns } from '@h-ai/reldb'
import { expect, it } from 'vitest'
import { defineDbSuite, mysqlEnv, postgresEnv, sqliteMemoryEnv } from '../../reldb/tests/helpers/reldb-test-suite.js'
import { migrateIam } from '../src/index.js'

for (const [name, setup] of [['sqlite', sqliteMemoryEnv], ['postgresql', postgresEnv], ['mysql', mysqlEnv]] as const) {
  defineDbSuite(name, setup, () => {
    it('旧用户升级预检只读，迁移保留身份和密码，重复运行不丢数据', async () => {
      for (const table of ['hai_iam_users', 'hai_schema_migrations'])
        expect((await reldb.ddl.dropTable(table)).success).toBe(true)
      expect((await reldb.ddl.createTable('hai_iam_users', { id: { type: 'TEXT', primaryKey: true }, username: { type: 'TEXT' }, password_hash: { type: 'TEXT' } })).success).toBe(true)
      await reldb.sql.execute('INSERT INTO hai_iam_users VALUES (?,?,?)', ['existing-user', 'alice', 'existing-password-hash'])
      const plan = await migrateIam({ dryRun: true })
      expect(plan).toMatchObject({ success: true, data: { changes: ['credential-and-reset-versions', 'account-lifecycle', 'initial-password-state', 'login-failure-window'], requiresExclusiveAccess: true } })
      expect(await schemaColumns(reldb, 'hai_schema_migrations')).toMatchObject({ success: true, data: [] })
      expect((await migrateIam()).success).toBe(true)
      expect((await migrateIam()).success).toBe(true)
      expect(await reldb.sql.get('SELECT * FROM hai_iam_users')).toMatchObject({ success: true, data: { id: 'existing-user', password_hash: 'existing-password-hash', credential_version: '', reset_version: '', reset_hash: null, reset_attempts: 0 } })
      expect(await reldb.sql.get('SELECT account_type, account_status, last_login_at FROM hai_iam_users')).toMatchObject({ success: true, data: { account_type: 'permanent', account_status: 'active', last_login_at: null } })
      expect(await migrateIam({ dryRun: true })).toMatchObject({ success: true, data: { currentVersion: 4, changes: [] } })
    })
  }, { database: reldb })
}
