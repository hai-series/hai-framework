import { err, HaiCommonError, ok } from '@h-ai/core'
import { expect, it } from 'vitest'
import { reldb } from '../src/index.js'
import { defineDbSuite, mysqlEnv, postgresEnv, sqliteMemoryEnv } from './helpers/reldb-test-suite.js'

for (const [name, setup] of [
  ['sqlite', sqliteMemoryEnv],
  ['postgresql', postgresEnv],
  ['mysql', mysqlEnv],
] as const) {
  defineDbSuite(`migration-${name}`, setup, () => {
    it('只读计划、失败重试与版本防降级；MySQL 隐式提交后按真实结构重入', async () => {
      await reldb.ddl.dropTable('migration_sample')
      await reldb.ddl.dropTable('hai_schema_migrations')
      await reldb.sql.execute('CREATE TABLE migration_sample (id INTEGER PRIMARY KEY)')
      let fail = true
      const steps = [
        {
          version: 1,
          name: 'add-value',
          needed: async (sql: typeof reldb.sql) => {
            const found = await reldb.schemaColumns('migration_sample', sql)
            return found.success
              ? ok(!found.data.includes('value'))
              : found
          },
          apply: async (sql: typeof reldb.sql) => sql.execute('ALTER TABLE migration_sample ADD COLUMN value TEXT'),
        },
        {
          version: 2,
          name: 'retry-boundary',
          needed: async () => ok(fail),
          apply: async () => err(HaiCommonError.INIT_FAILED, 'Retry required'),
        },
      ]
      expect((await reldb.migrateSchema('migration-test', steps, { dryRun: true })).success).toBe(true)
      expect(await reldb.schemaColumns('hai_schema_migrations')).toMatchObject({ success: true, data: [] })
      expect(await reldb.migrateSchema('migration-test', steps)).toMatchObject({
        success: false,
        error: {
          cause: { code: HaiCommonError.INIT_FAILED.code, message: 'Retry required' },
        },
      })
      fail = false
      expect((await reldb.migrateSchema('migration-test', steps)).success).toBe(true)
      expect((await reldb.migrateSchema('migration-test', steps)).success).toBe(true)
      expect((await reldb.migrateSchema('migration-test', [])).success).toBe(false)
    })
  })
}
