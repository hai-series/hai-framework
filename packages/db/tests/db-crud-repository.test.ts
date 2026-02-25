/**
 * =============================================================================
 * @h-ai/db - BaseCrudRepository 测试
 * =============================================================================
 */

import type { CrudFieldDefinition } from '../src/index.js'
import { describe, expect, it } from 'vitest'
import { DbErrorCode } from '../src/db-config.js'
import { BaseCrudRepository, db } from '../src/index.js'
import { defineDbSuite, mysqlEnv, postgresEnv, sqliteMemoryEnv } from './helpers/db-test-suite.js'

interface UserRow {
  id: number
  name: string
  email: string
  enabled: boolean
  metadata?: Record<string, unknown>
  lastLoginFailedAt?: Date
  createdAt: Date
  updatedAt: Date
}

const USER_FIELDS: CrudFieldDefinition[] = [
  {
    fieldName: 'id',
    columnName: 'id',
    def: { type: 'INTEGER' as const, primaryKey: true, autoIncrement: true },
    select: true,
    create: false,
    update: false,
  },
  {
    fieldName: 'name',
    columnName: 'name',
    def: { type: 'TEXT' as const, notNull: true },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'email',
    columnName: 'email',
    def: { type: 'TEXT' as const, notNull: true },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'enabled',
    columnName: 'enabled',
    def: { type: 'BOOLEAN' as const, notNull: true, defaultValue: 1 },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'metadata',
    columnName: 'metadata',
    def: { type: 'JSON' as const },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'lastLoginFailedAt',
    columnName: 'last_login_failed_at',
    def: { type: 'TIMESTAMP' as const },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'createdAt',
    columnName: 'created_at',
    def: { type: 'TIMESTAMP' as const, notNull: true },
    select: true,
    create: true,
    update: false,
  },
  {
    fieldName: 'updatedAt',
    columnName: 'updated_at',
    def: { type: 'TIMESTAMP' as const, notNull: true },
    select: true,
    create: true,
    update: false,
  },
]

interface ApiKeyRow {
  id: string
  name: string
  createdAt: Date
  updatedAt: Date
}

const API_KEY_FIELDS: CrudFieldDefinition[] = [
  {
    fieldName: 'id',
    columnName: 'id',
    def: { type: 'TEXT' as const, primaryKey: true },
    select: true,
    create: true,
    update: false,
  },
  {
    fieldName: 'name',
    columnName: 'name',
    def: { type: 'TEXT' as const, notNull: true },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'createdAt',
    columnName: 'created_at',
    def: { type: 'TIMESTAMP' as const, notNull: true },
    select: true,
    create: true,
    update: false,
  },
  {
    fieldName: 'updatedAt',
    columnName: 'updated_at',
    def: { type: 'TIMESTAMP' as const, notNull: true },
    select: true,
    create: true,
    update: false,
  },
]

class UserRepository extends BaseCrudRepository<UserRow> {
  constructor() {
    super(db, {
      table: 'users',
      idColumn: 'id',
      fields: USER_FIELDS,
    })
  }

  async findByEmail(email: string) {
    return this.findAll({ where: 'email = ?', params: [email], limit: 1 })
  }

  async insertRaw(data: { name: string, email: string, enabled?: boolean }, tx?: import('../src/index.js').TxHandle) {
    const isSqlite = db.config?.type === 'sqlite'
    const now = isSqlite ? Date.now() : new Date()
    const enabledValue = data.enabled ?? true
    const normalizedEnabled = isSqlite ? (enabledValue ? 1 : 0) : enabledValue
    return this.sql(tx).execute(
      'INSERT INTO users (name, email, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [data.name, data.email, normalizedEnabled, now, now],
    )
  }
}

class ApiKeyRepository extends BaseCrudRepository<ApiKeyRow> {
  private idCounter = 0

  constructor() {
    super(db, {
      table: 'api_keys',
      idColumn: 'id',
      idField: 'id',
      fields: API_KEY_FIELDS,
      generateId: () => {
        this.idCounter += 1
        return `key-${this.idCounter}`
      },
    })
  }
}

describe('db.BaseCrudRepository', () => {
  const defineCommon = (label: 'sqlite' | 'mysql' | 'postgresql') => {
    const ensureTable = async () => {
      await db.ddl.dropTable('users', true)
    }

    it(`${label}: should auto-create table and map fields`, async () => {
      await ensureTable()
      const repo = new UserRepository()

      const loginAt = new Date('2024-01-01T00:00:00Z')
      const createResult = await repo.create({
        name: '用户1',
        email: 'u1@test.com',
        metadata: { tier: 'pro' },
        lastLoginFailedAt: loginAt,
      })
      if (!createResult.success) {
        throw new Error(createResult.error.message)
      }
      expect(createResult.success).toBe(true)

      const byEmail = await repo.findByEmail('u1@test.com')
      expect(byEmail.success).toBe(true)
      if (byEmail.success) {
        expect(byEmail.data).toHaveLength(1)
        const user = byEmail.data[0]
        expect(user?.name).toBe('用户1')
        expect(user?.enabled).toBe(true)
        expect(user?.metadata).toEqual({ tier: 'pro' })
        expect(user?.lastLoginFailedAt).toBeInstanceOf(Date)
        expect(user?.lastLoginFailedAt?.getTime()).toBe(loginAt.getTime())
        expect(user?.createdAt).toBeInstanceOf(Date)
        expect(user?.updatedAt).toBeInstanceOf(Date)
      }

      const existsById = await repo.existsById(1)
      expect(existsById.success).toBe(true)
      if (existsById.success) {
        expect(existsById.data).toBe(true)
      }
    })

    it(`${label}: should update and bump updatedAt`, async () => {
      await ensureTable()
      const repo = new UserRepository()

      const createResult = await repo.create({ name: '用户2', email: 'u2@test.com', enabled: false })
      if (!createResult.success) {
        throw new Error(createResult.error.message)
      }
      expect(createResult.success).toBe(true)

      const before = await repo.findById(1)
      expect(before.success).toBe(true)

      await new Promise(resolve => setTimeout(resolve, 5))

      const updateResult = await repo.updateById(1, { name: '用户2-更新' })
      expect(updateResult.success).toBe(true)

      const after = await repo.findById(1)
      expect(after.success).toBe(true)
      if (before.success && after.success && before.data && after.data) {
        expect(after.data.name).toBe('用户2-更新')
        expect(after.data.updatedAt.getTime()).toBeGreaterThanOrEqual(before.data.updatedAt.getTime())
      }
    })

    it(`${label}: should return config error on empty update payload`, async () => {
      await ensureTable()
      const repo = new UserRepository()

      const createResult = await repo.create({ name: '用户3', email: 'u3@test.com' })
      if (!createResult.success) {
        throw new Error(createResult.error.message)
      }
      expect(createResult.success).toBe(true)

      const updateResult = await repo.updateById(1, {})
      expect(updateResult.success).toBe(false)
      if (!updateResult.success) {
        expect(updateResult.error.code).toBe(DbErrorCode.CONFIG_ERROR)
      }
    })

    it(`${label}: should generate ids for string primary keys`, async () => {
      await db.ddl.dropTable('api_keys', true)
      const repo = new ApiKeyRepository()

      const createManyResult = await repo.createMany([
        { name: 'key-a' },
        { name: 'key-b' },
      ])
      if (!createManyResult.success) {
        throw new Error('createMany failed')
      }
      expect(createManyResult.success).toBe(true)

      const listResult = await repo.findAll({ orderBy: 'id ASC' })
      expect(listResult.success).toBe(true)
      if (listResult.success) {
        expect(listResult.data.map((item: ApiKeyRow) => item.id)).toEqual(['key-1', 'key-2'])
      }
    })

    it(`${label}: should support tx handle for multi-repo operations`, async () => {
      await db.ddl.dropTable('users', true)
      await db.ddl.dropTable('api_keys', true)

      const userRepo = new UserRepository()
      const apiKeyRepo = new ApiKeyRepository()

      const txResult = await db.tx.begin()
      expect(txResult.success).toBe(true)
      if (!txResult.success) {
        return
      }

      const tx = txResult.data
      const createUser = await userRepo.create({ name: '用户TX', email: 'tx@test.com' }, tx)
      expect(createUser.success).toBe(true)

      const createKey = await apiKeyRepo.create({ name: 'key-tx' }, tx)
      expect(createKey.success).toBe(true)

      const inTxCount = await userRepo.count(undefined, tx)
      expect(inTxCount.success).toBe(true)
      if (inTxCount.success) {
        expect(inTxCount.data).toBe(1)
      }

      const rollbackResult = await tx.rollback()
      expect(rollbackResult.success).toBe(true)

      const afterCount = await userRepo.count()
      expect(afterCount.success).toBe(true)
      if (afterCount.success) {
        expect(afterCount.data).toBe(0)
      }
    })

    it(`${label}: sql helper should route to tx crud when provided`, async () => {
      await ensureTable()
      const repo = new UserRepository()

      const txResult = await db.tx.begin()
      expect(txResult.success).toBe(true)
      if (!txResult.success) {
        return
      }

      const tx = txResult.data
      const createResult = await repo.insertRaw({ name: '用户TX2', email: 'tx2@test.com' }, tx)
      expect(createResult.success).toBe(true)

      const rollbackResult = await tx.rollback()
      expect(rollbackResult.success).toBe(true)

      const afterCount = await repo.count()
      expect(afterCount.success).toBe(true)
      if (afterCount.success) {
        expect(afterCount.data).toBe(0)
      }
    })

    it(`${label}: deleteById should remove record`, async () => {
      await ensureTable()
      const repo = new UserRepository()

      const createResult = await repo.create({ name: '用户Del', email: 'del@test.com' })
      expect(createResult.success).toBe(true)

      const countBefore = await repo.count()
      expect(countBefore.success).toBe(true)
      if (countBefore.success) {
        expect(countBefore.data).toBe(1)
      }

      const deleteResult = await repo.deleteById(1)
      expect(deleteResult.success).toBe(true)
      if (deleteResult.success) {
        expect(deleteResult.data.changes).toBe(1)
      }

      const countAfter = await repo.count()
      expect(countAfter.success).toBe(true)
      if (countAfter.success) {
        expect(countAfter.data).toBe(0)
      }
    })

    it(`${label}: findById non-existent should return null`, async () => {
      await ensureTable()
      const repo = new UserRepository()

      const result = await repo.findById(999)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBeNull()
      }
    })

    it(`${label}: existsById non-existent should return false`, async () => {
      await ensureTable()
      const repo = new UserRepository()

      const result = await repo.existsById(999)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(false)
      }
    })

    it(`${label}: exists on empty table should return false`, async () => {
      await ensureTable()
      const repo = new UserRepository()

      const result = await repo.exists()
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(false)
      }
    })

    it(`${label}: count with where clause should filter`, async () => {
      await ensureTable()
      const repo = new UserRepository()

      await repo.create({ name: '用户A', email: 'a@test.com' })
      await repo.create({ name: '用户B', email: 'b@test.com' })
      await repo.create({ name: '用户C', email: 'c@test.com' })

      const result = await repo.count({ where: 'email LIKE ?', params: ['%b@%'] })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(1)
      }
    })

    it(`${label}: findAll with where and orderBy should work`, async () => {
      await ensureTable()
      const repo = new UserRepository()

      await repo.create({ name: '用户C', email: 'c@test.com' })
      await repo.create({ name: '用户A', email: 'a@test.com' })
      await repo.create({ name: '用户B', email: 'b@test.com' })

      const result = await repo.findAll({ where: 'name LIKE ?', params: ['用户%'], orderBy: 'email ASC' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveLength(3)
        expect(result.data[0].email).toBe('a@test.com')
        expect(result.data[2].email).toBe('c@test.com')
      }
    })

    it(`${label}: findPage should return paginated results`, async () => {
      await ensureTable()
      const repo = new UserRepository()

      await repo.create({ name: '用户1', email: 'u1@test.com' })
      await repo.create({ name: '用户2', email: 'u2@test.com' })
      await repo.create({ name: '用户3', email: 'u3@test.com' })

      const result = await repo.findPage({
        orderBy: 'id ASC',
        pagination: { page: 1, pageSize: 2 },
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.total).toBe(3)
        expect(result.data.items).toHaveLength(2)
        expect(result.data.page).toBe(1)
        expect(result.data.pageSize).toBe(2)
      }
    })

    it(`${label}: createMany empty array should succeed`, async () => {
      await ensureTable()
      const repo = new UserRepository()

      const result = await repo.createMany([])
      expect(result.success).toBe(true)
    })

    it(`${label}: findAll with limit should restrict results`, async () => {
      await ensureTable()
      const repo = new UserRepository()

      await repo.create({ name: '用户1', email: 'u1@test.com' })
      await repo.create({ name: '用户2', email: 'u2@test.com' })
      await repo.create({ name: '用户3', email: 'u3@test.com' })

      const result = await repo.findAll({ orderBy: 'id ASC', limit: 2 })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveLength(2)
      }
    })
  }

  defineDbSuite('sqlite', sqliteMemoryEnv, () => defineCommon('sqlite'))

  defineDbSuite('mysql', mysqlEnv, () => defineCommon('mysql'))

  defineDbSuite('postgresql', postgresEnv, () => defineCommon('postgresql'))
})
