/**
 * =============================================================================
 * @h-ai/reldb - 未初始化行为测试
 * =============================================================================
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { reldb, ReldbErrorCode } from '../src/index.js'

describe.sequential('db (not initialized)', () => {
  beforeEach(async () => {
    await reldb.close()
  })

  it('ddl 操作应返回 NOT_INITIALIZED', async () => {
    const result = await reldb.ddl.createTable('users', {
      id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(ReldbErrorCode.NOT_INITIALIZED)
    }
  })

  it('sql 操作应返回 NOT_INITIALIZED', async () => {
    const result = await reldb.sql.query('SELECT 1')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(ReldbErrorCode.NOT_INITIALIZED)
    }
  })

  it('sql.get 应返回 NOT_INITIALIZED', async () => {
    const result = await reldb.sql.get('SELECT 1')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(ReldbErrorCode.NOT_INITIALIZED)
    }
  })

  it('sql.execute 应返回 NOT_INITIALIZED', async () => {
    const result = await reldb.sql.execute('DELETE FROM users')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(ReldbErrorCode.NOT_INITIALIZED)
    }
  })

  it('sql.batch 应返回 NOT_INITIALIZED', async () => {
    const result = await reldb.sql.batch([{ sql: 'SELECT 1' }])
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(ReldbErrorCode.NOT_INITIALIZED)
    }
  })

  it('sql.queryPage 应返回 NOT_INITIALIZED', async () => {
    const result = await reldb.sql.queryPage({ sql: 'SELECT 1' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(ReldbErrorCode.NOT_INITIALIZED)
    }
  })

  it('tx 操作应返回 NOT_INITIALIZED', async () => {
    const wrapResult = await reldb.tx.wrap(async (tx) => {
      await tx.execute('INSERT INTO users (name) VALUES (?)', ['用户A'])
      return 1
    })

    expect(wrapResult.success).toBe(false)
    if (!wrapResult.success) {
      expect(wrapResult.error.code).toBe(ReldbErrorCode.NOT_INITIALIZED)
    }

    const beginResult = await reldb.tx.begin()
    expect(beginResult.success).toBe(false)
    if (!beginResult.success) {
      expect(beginResult.error.code).toBe(ReldbErrorCode.NOT_INITIALIZED)
    }
  })

  it('crud 操作应返回 NOT_INITIALIZED', async () => {
    const crud = reldb.crud.table({
      table: 'users',
      idColumn: 'id',
      dbType: 'sqlite',
    })

    const findAll = await crud.findAll()
    expect(findAll.success).toBe(false)
    if (!findAll.success) {
      expect(findAll.error.code).toBe(ReldbErrorCode.NOT_INITIALIZED)
    }

    const findById = await crud.findById(1)
    expect(findById.success).toBe(false)
    if (!findById.success) {
      expect(findById.error.code).toBe(ReldbErrorCode.NOT_INITIALIZED)
    }

    const getById = await crud.getById(1)
    expect(getById.success).toBe(false)
    if (!getById.success) {
      expect(getById.error.code).toBe(ReldbErrorCode.NOT_INITIALIZED)
    }

    const create = await crud.create({ name: '用户A' })
    expect(create.success).toBe(false)
    if (!create.success) {
      expect(create.error.code).toBe(ReldbErrorCode.NOT_INITIALIZED)
    }

    const count = await crud.count()
    expect(count.success).toBe(false)
    if (!count.success) {
      expect(count.error.code).toBe(ReldbErrorCode.NOT_INITIALIZED)
    }
  })

  it('ddl 其他操作应返回 NOT_INITIALIZED', async () => {
    const dropTable = await reldb.ddl.dropTable('users')
    expect(dropTable.success).toBe(false)
    if (!dropTable.success) {
      expect(dropTable.error.code).toBe(ReldbErrorCode.NOT_INITIALIZED)
    }

    const addColumn = await reldb.ddl.addColumn('users', 'age', { type: 'INTEGER' })
    expect(addColumn.success).toBe(false)
    if (!addColumn.success) {
      expect(addColumn.error.code).toBe(ReldbErrorCode.NOT_INITIALIZED)
    }

    const renameTable = await reldb.ddl.renameTable('users', 'users2')
    expect(renameTable.success).toBe(false)
    if (!renameTable.success) {
      expect(renameTable.error.code).toBe(ReldbErrorCode.NOT_INITIALIZED)
    }

    const raw = await reldb.ddl.raw('SELECT 1')
    expect(raw.success).toBe(false)
    if (!raw.success) {
      expect(raw.error.code).toBe(ReldbErrorCode.NOT_INITIALIZED)
    }
  })
})
