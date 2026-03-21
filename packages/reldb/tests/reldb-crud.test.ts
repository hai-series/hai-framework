/**
 * =============================================================================
 * @h-ai/reldb - CRUD 抽象测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { reldb } from '../src/index.js'
import { ReldbErrorCode } from '../src/reldb-config.js'
import { defineDbSuite, mysqlDockerOpts, mysqlEnv, postgresDockerOpts, postgresEnv, sqliteMemoryEnv } from './helpers/reldb-test-suite.js'

interface UserRow {
  id: number
  name: string
  email: string
}

describe('reldb.crud', () => {
  const defineCommon = (label: 'sqlite' | 'mysql' | 'postgresql') => {
    const userCrud = () => reldb.crud.table<UserRow>({
      table: 'users',
      idColumn: 'id',
      select: ['id', 'name', 'email'],
      createColumns: ['name', 'email'],
      updateColumns: ['name', 'email'],
      dbType: label,
    })

    const userCrudWithDbType = () => reldb.crud.table<UserRow>({
      table: 'users',
      idColumn: 'id',
      select: ['id', 'name', 'email'],
      createColumns: ['id', 'name', 'email'],
      updateColumns: ['name', 'email'],
      dbType: label,
    })

    const ensureTable = async () => {
      await reldb.ddl.dropTable('users', true)
      const create = await reldb.ddl.createTable('users', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        name: { type: 'TEXT', notNull: true },
        email: { type: 'TEXT', notNull: true },
      })
      expect(create.success).toBe(true)
    }

    it(`${label}: crud functions should work with reldb.sql`, async () => {
      await ensureTable()
      const crud = userCrud()

      const createResult = await crud.create({ name: '用户1', email: 'u1@test.com' })
      expect(createResult.success).toBe(true)

      const createManyResult = await crud.createMany([
        { name: '用户2', email: 'u2@test.com' },
        { name: '用户3', email: 'u3@test.com' },
      ])
      expect(createManyResult.success).toBe(true)

      const listResult = await crud.findAll({ orderBy: 'id ASC' })
      expect(listResult.success).toBe(true)
      if (listResult.success) {
        expect(listResult.data).toHaveLength(3)
      }

      const pageResult = await crud.findPage({
        orderBy: 'id ASC',
        pagination: { page: 1, pageSize: 2 },
      })
      expect(pageResult.success).toBe(true)
      if (pageResult.success) {
        expect(pageResult.data.total).toBe(3)
        expect(pageResult.data.items).toHaveLength(2)
      }

      const countResult = await crud.count({ where: 'name LIKE ?', params: ['用户%'] })
      expect(countResult.success).toBe(true)
      if (countResult.success) {
        expect(countResult.data).toBe(3)
      }

      const findResult = await crud.findById(1)
      expect(findResult.success).toBe(true)
      if (findResult.success) {
        expect(findResult.data?.name).toBe('用户1')
      }

      const existsResult = await crud.existsById(1)
      expect(existsResult.success).toBe(true)
      if (existsResult.success) {
        expect(existsResult.data).toBe(true)
      }

      const updateResult = await crud.updateById(1, { name: '用户1-更新' })
      expect(updateResult.success).toBe(true)

      const updated = await crud.findById(1)
      expect(updated.success).toBe(true)
      if (updated.success) {
        expect(updated.data?.name).toBe('用户1-更新')
      }

      const deleteResult = await crud.deleteById(3)
      expect(deleteResult.success).toBe(true)

      const finalCount = await crud.count()
      expect(finalCount.success).toBe(true)
      if (finalCount.success) {
        expect(finalCount.data).toBe(2)
      }
    })

    it(`${label}: crud functions should work inside tx.wrap`, async () => {
      await ensureTable()

      const txResult = await reldb.tx.wrap(async (tx) => {
        const txCrud = tx.crud.table<UserRow>({
          table: 'users',
          idColumn: 'id',
          select: ['id', 'name', 'email'],
          createColumns: ['name', 'email'],
          updateColumns: ['name', 'email'],
          dbType: label,
        })

        const insert = await txCrud.create({ name: '用户A', email: 'a@test.com' })
        if (!insert.success) {
          throw new Error(insert.error.message)
        }

        const count = await txCrud.count()
        if (!count.success) {
          throw new Error(count.error.message)
        }

        return count.data
      })

      expect(txResult.success).toBe(true)
      if (txResult.success) {
        expect(txResult.data).toBe(1)
      }
    })

    it(`${label}: crud functions should work with stepwise transaction`, async () => {
      await ensureTable()

      const txResult = await reldb.tx.begin()
      expect(txResult.success).toBe(true)
      if (!txResult.success) {
        return
      }

      const tx = txResult.data
      const txCrud = tx.crud.table<UserRow>({
        table: 'users',
        idColumn: 'id',
        select: ['id', 'name', 'email'],
        createColumns: ['name', 'email'],
        updateColumns: ['name', 'email'],
        dbType: label,
      })

      const insert = await txCrud.create({ name: '用户B', email: 'b@test.com' })
      expect(insert.success).toBe(true)
      if (!insert.success) {
        await tx.rollback()
        return
      }

      const commit = await tx.commit()
      expect(commit.success).toBe(true)

      const count = await reldb.sql.get<{ count: number }>('SELECT COUNT(*) as count FROM users')
      expect(count.success).toBe(true)
      if (count.success) {
        expect(Number(count.data?.count)).toBe(1)
      }
    })

    it(`${label}: findById non-existent should return null`, async () => {
      await ensureTable()
      const crud = userCrud()

      const result = await crud.findById(999)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBeNull()
      }
    })

    it(`${label}: existsById non-existent should return false`, async () => {
      await ensureTable()
      const crud = userCrud()

      const result = await crud.existsById(999)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(false)
      }
    })

    it(`${label}: exists on empty table should return false`, async () => {
      await ensureTable()
      const crud = userCrud()

      const result = await crud.exists()
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(false)
      }
    })

    it(`${label}: count on empty table should return 0`, async () => {
      await ensureTable()
      const crud = userCrud()

      const result = await crud.count()
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(0)
      }
    })

    it(`${label}: findAll on empty table should return empty array`, async () => {
      await ensureTable()
      const crud = userCrud()

      const result = await crud.findAll()
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual([])
      }
    })

    it(`${label}: findPage on empty table should return empty page`, async () => {
      await ensureTable()
      const crud = userCrud()

      const result = await crud.findPage({
        pagination: { page: 1, pageSize: 10 },
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.total).toBe(0)
        expect(result.data.items).toHaveLength(0)
      }
    })

    it(`${label}: deleteById non-existent should return changes=0`, async () => {
      await ensureTable()
      const crud = userCrud()

      const result = await crud.deleteById(999)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.changes).toBe(0)
      }
    })

    it(`${label}: updateById non-existent should return changes=0`, async () => {
      await ensureTable()
      const crud = userCrud()

      const result = await crud.updateById(999, { name: '不存在' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.changes).toBe(0)
      }
    })

    it(`${label}: findAll with where clause should filter`, async () => {
      await ensureTable()
      const crud = userCrud()

      await crud.create({ name: '用户X', email: 'x@test.com' })
      await crud.create({ name: '用户Y', email: 'y@test.com' })
      await crud.create({ name: '用户Z', email: 'z@test.com' })

      const result = await crud.findAll({
        where: 'email LIKE ?',
        params: ['%y@%'],
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveLength(1)
        expect(result.data[0].name).toBe('用户Y')
      }
    })

    it(`${label}: count with where clause should filter`, async () => {
      await ensureTable()
      const crud = userCrud()

      await crud.create({ name: '用户X', email: 'x@test.com' })
      await crud.create({ name: '用户Y', email: 'y@test.com' })

      const result = await crud.count({ where: 'email = ?', params: ['x@test.com'] })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(1)
      }
    })

    // ─── createOrUpdate（kernel 层） ───

    it(`${label}: createOrUpdate should insert when no conflict`, async () => {
      await ensureTable()
      const crud = userCrudWithDbType()

      const result = await crud.createOrUpdate({ id: 100, name: '用户UP', email: 'up@test.com' })
      expect(result.success).toBe(true)

      const found = await crud.findById(100)
      expect(found.success).toBe(true)
      if (found.success) {
        expect(found.data?.name).toBe('用户UP')
        expect(found.data?.email).toBe('up@test.com')
      }
    })

    it(`${label}: createOrUpdate should update on primary key conflict`, async () => {
      await ensureTable()
      const crud = userCrudWithDbType()

      await crud.createOrUpdate({ id: 200, name: '原始', email: 'orig@test.com' })

      const upsertResult = await crud.createOrUpdate({ id: 200, name: '更新', email: 'updated@test.com' })
      expect(upsertResult.success).toBe(true)

      const found = await crud.findById(200)
      expect(found.success).toBe(true)
      if (found.success) {
        expect(found.data?.name).toBe('更新')
        expect(found.data?.email).toBe('updated@test.com')
      }

      // 只有一条记录
      const count = await crud.count()
      expect(count.success).toBe(true)
      if (count.success) {
        expect(count.data).toBe(1)
      }
    })

    it(`${label}: createOrUpdate should respect updateColumns whitelist`, async () => {
      await ensureTable()
      // updateColumns 仅含 name，不含 email
      const crud = reldb.crud.table<UserRow>({
        table: 'users',
        idColumn: 'id',
        select: ['id', 'name', 'email'],
        createColumns: ['id', 'name', 'email'],
        updateColumns: ['name'],
        dbType: label,
      })

      await crud.createOrUpdate({ id: 300, name: '原名', email: 'orig@test.com' })

      // 第二次 upsert：email 应保持不变（不在 updateColumns 中）
      await crud.createOrUpdate({ id: 300, name: '新名', email: 'new@test.com' })

      const found = await crud.findById(300)
      expect(found.success).toBe(true)
      if (found.success) {
        expect(found.data?.name).toBe('新名')
        expect(found.data?.email).toBe('orig@test.com')
      }
    })

    it(`${label}: createOrUpdate with empty data should return error`, async () => {
      await ensureTable()
      const crud = userCrudWithDbType()

      const result = await crud.createOrUpdate({})
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(ReldbErrorCode.CONFIG_ERROR)
      }
    })

    it(`${label}: createOrUpdate should work inside transaction`, async () => {
      await ensureTable()

      const txResult = await reldb.tx.begin()
      expect(txResult.success).toBe(true)
      if (!txResult.success) {
        return
      }

      const tx = txResult.data
      const txCrud = tx.crud.table<UserRow>({
        table: 'users',
        idColumn: 'id',
        select: ['id', 'name', 'email'],
        createColumns: ['id', 'name', 'email'],
        updateColumns: ['name', 'email'],
        dbType: label,
      })

      const upsert = await txCrud.createOrUpdate({ id: 400, name: '事务UP', email: 'txup@test.com' })
      expect(upsert.success).toBe(true)

      const rollback = await tx.rollback()
      expect(rollback.success).toBe(true)

      // 回滚后应无记录
      const count = await reldb.sql.get<{ cnt: number }>('SELECT COUNT(*) as cnt FROM users')
      expect(count.success).toBe(true)
      if (count.success) {
        expect(Number(count.data?.cnt)).toBe(0)
      }
    })

    // ─── getById（kernel 层） ───

    it(`${label}: getById should return record when exists`, async () => {
      await ensureTable()
      const crud = userCrud()

      await crud.create({ name: '用户G', email: 'g@test.com' })

      const result = await crud.getById(1)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.name).toBe('用户G')
        expect(result.data.email).toBe('g@test.com')
      }
    })

    it(`${label}: getById non-existent should return RECORD_NOT_FOUND`, async () => {
      await ensureTable()
      const crud = userCrud()

      const result = await crud.getById(999)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(ReldbErrorCode.RECORD_NOT_FOUND)
      }
    })
  }

  defineDbSuite('sqlite', sqliteMemoryEnv, () => defineCommon('sqlite'))

  defineDbSuite('mysql', mysqlEnv, () => defineCommon('mysql'), mysqlDockerOpts)

  defineDbSuite('postgresql', postgresEnv, () => defineCommon('postgresql'), postgresDockerOpts)
})
