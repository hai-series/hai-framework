import { cache } from '@h-ai/cache'
import { reldb } from '@h-ai/reldb'
import { expect, it } from 'vitest'
import { postgresEnv } from '../../reldb/tests/helpers/reldb-test-suite.js'
import { iam } from '../src/index.js'

it('detects a conflicting PostgreSQL index name, rolls back the RBAC relation and retries', async () => {
  const database = await postgresEnv()
  try {
    expect((await reldb.init({
      ...database.config,
      pool: { max: 1 },
    })).success).toBe(true)
    expect((await cache.init({ type: 'memory' })).success).toBe(true)
    expect((await reldb.ddl.createTable('idx_role_perm_role_perm', {
      collision: { type: 'TEXT' },
    })).success).toBe(true)
    expect((await iam.init({ seedDefaultData: false })).success).toBe(false)
    const columns = await reldb.schemaColumns('hai_iam_role_permissions')
    expect(columns.success && columns.data).toEqual([])
    expect((await reldb.ddl.dropTable('idx_role_perm_role_perm')).success).toBe(true)
    expect((await iam.init({ seedDefaultData: false })).success).toBe(true)
    expect((await iam.authz.getAllRoles()).success).toBe(true)
  }
  finally {
    await iam.close()
    await cache.close()
    await reldb.close()
    await database.release?.()
  }
}, 120_000)
