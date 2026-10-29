import { reldb, schemaColumns } from '@h-ai/reldb'
import { expect, it } from 'vitest'
import { defineDbSuite, mysqlEnv, postgresEnv, sqliteMemoryEnv } from '../../reldb/tests/helpers/reldb-test-suite.js'
import { migrateIam } from '../src/index.js'

for (const [name, setup] of [['sqlite', sqliteMemoryEnv], ['postgresql', postgresEnv], ['mysql', mysqlEnv]] as const) {
  defineDbSuite(name, setup, () => {
    it('迁移为唯一账号状态：停用转休眠、注销不恢复、删除旧列且重复迁移不改变凭据', async () => {
      for (const table of ['hai_iam_users', 'hai_schema_migrations'])
        expect((await reldb.ddl.dropTable(table)).success).toBe(true)
      expect((await reldb.ddl.createTable('hai_iam_users', {
        id: { type: 'TEXT', primaryKey: true },
        password_hash: { type: 'TEXT' },
        enabled: { type: 'BOOLEAN' },
        account_status: { type: 'TEXT', notNull: true, defaultValue: 'active' },
        credential_version: { type: 'TEXT', notNull: true, defaultValue: 'legacy-v1' },
      })).success).toBe(true)
      const cases = [
        { id: 'active', enabled: true, status: 'active', expected: 'active' },
        { id: 'disabled', enabled: false, status: 'active', expected: 'dormant' },
        { id: 'dormant', enabled: true, status: 'dormant', expected: 'dormant' },
        { id: 'closed-disabled', enabled: false, status: 'closed', expected: 'closed' },
        { id: 'closed', enabled: true, status: 'closed', expected: 'closed' },
        { id: 'legacy-null', enabled: null, status: 'active', expected: 'dormant' },
      ] as const
      for (const row of cases) {
        const enabled = row.enabled === null ? null : reldb.config?.type === 'postgresql' ? row.enabled : Number(row.enabled)
        expect((await reldb.sql.execute('INSERT INTO hai_iam_users (id,password_hash,enabled,account_status) VALUES (?,?,?,?)', [row.id, `preserved-${row.id}`, enabled, row.status])).success).toBe(true)
      }
      const plan = await migrateIam({ dryRun: true })
      expect(plan.success && plan.data.changes).toContain('account-lifecycle-only')
      expect(plan).toMatchObject({ success: true, data: { requiresExclusiveAccess: true } })
      const before = await schemaColumns(reldb, 'hai_iam_users')
      expect(before.success && before.data).toContain('enabled')
      expect((await migrateIam()).success).toBe(true)
      const columns = await schemaColumns(reldb, 'hai_iam_users')
      expect(columns.success).toBe(true)
      expect(columns.success && columns.data).not.toContain('enabled')
      for (const row of cases) {
        const result = await reldb.sql.get('SELECT id,password_hash,account_status,credential_version FROM hai_iam_users WHERE id = ?', [row.id])
        expect(result).toMatchObject({ success: true, data: { id: row.id, password_hash: `preserved-${row.id}`, account_status: row.expected } })
        if (result.success && result.data) {
          if (row.status === 'active' && row.enabled !== true)
            expect(result.data.credential_version).not.toBe('legacy-v1')
          else
            expect(result.data.credential_version).toBe('legacy-v1')
        }
      }
      const version = await reldb.sql.get('SELECT credential_version FROM hai_iam_users WHERE id = ?', ['disabled'])
      expect((await migrateIam()).success).toBe(true)
      expect(await reldb.sql.get('SELECT credential_version FROM hai_iam_users WHERE id = ?', ['disabled'])).toEqual(version)
      expect(await migrateIam({ dryRun: true })).toMatchObject({ success: true, data: { currentVersion: 6, changes: [] } })
    })

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
      expect(await migrateIam({ dryRun: true })).toMatchObject({ success: true, data: { currentVersion: 6, changes: [] } })
    })

    it('升级旧权限表保留授权数据，敏感操作空值不自动添加限制', async () => {
      expect((await reldb.ddl.dropTable('hai_iam_permissions')).success).toBe(true)
      expect((await reldb.ddl.createTable('hai_iam_permissions', { id: { type: 'TEXT', primaryKey: true }, code: { type: 'TEXT' } })).success).toBe(true)
      expect((await reldb.sql.execute('INSERT INTO hai_iam_permissions (id,code) VALUES (?,?)', ['existing-permission', 'orders:approve'])).success).toBe(true)
      const plan = await migrateIam({ dryRun: true })
      expect(plan.success && plan.data.changes).toContain('permission-sensitive-operations')
      expect((await schemaColumns(reldb, 'hai_iam_permissions')).success).toBe(true)
      expect((await migrateIam()).success).toBe(true)
      expect((await migrateIam()).success).toBe(true)
      expect(await reldb.sql.get('SELECT id,code,sensitive_operations FROM hai_iam_permissions')).toMatchObject({ success: true, data: { id: 'existing-permission', code: 'orders:approve', sensitive_operations: null } })
    })
  }, { database: reldb })
}
