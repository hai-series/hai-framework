/**
 * =============================================================================
 * @hai/db - CRUD 抽象测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { db } from '../src/index.js'
import { defineDbSuite, mysqlEnv, postgresEnv, sqliteMemoryEnv } from './helpers/db-test-suite.js'

interface UserRow {
  id: number
  name: string
  email: string
}

describe('db.crud', () => {
  const defineCommon = (label: 'sqlite' | 'mysql' | 'postgresql') => {
    const userCrud = () => db.crud.table<UserRow>({
      table: 'users',
      idColumn: 'id',
      select: ['id', 'name', 'email'],
      createColumns: ['name', 'email'],
      updateColumns: ['name', 'email'],
    })

    const ensureTable = async () => {
      await db.ddl.dropTable('users', true)
      const create = await db.ddl.createTable('users', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        name: { type: 'TEXT', notNull: true },
        email: { type: 'TEXT', notNull: true },
      })
      expect(create.success).toBe(true)
    }

    it(`${label}: crud functions should work with db.sql`, async () => {
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

      const txResult = await db.tx.wrap(async (tx) => {
        const txCrud = tx.crud.table<UserRow>({
          table: 'users',
          idColumn: 'id',
          select: ['id', 'name', 'email'],
          createColumns: ['name', 'email'],
          updateColumns: ['name', 'email'],
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

      const txResult = await db.tx.begin()
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
      })

      const insert = await txCrud.create({ name: '用户B', email: 'b@test.com' })
      expect(insert.success).toBe(true)
      if (!insert.success) {
        await tx.rollback()
        return
      }

      const commit = await tx.commit()
      expect(commit.success).toBe(true)

      const count = await db.sql.get<{ count: number }>('SELECT COUNT(*) as count FROM users')
      expect(count.success).toBe(true)
      if (count.success) {
        expect(Number(count.data?.count)).toBe(1)
      }
    })
  }

  defineDbSuite('sqlite', sqliteMemoryEnv, () => defineCommon('sqlite'))

  defineDbSuite('mysql', mysqlEnv, () => defineCommon('mysql'))

  defineDbSuite('postgresql', postgresEnv, () => defineCommon('postgresql'))
})
