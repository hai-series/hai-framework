/**
 * =============================================================================
 * @h-ai/reldb - BaseReldbCrudRepository 测试
 * =============================================================================
 */

import type { ReldbCrudFieldDefinition } from '../src/index.js'
import { describe, expect, it } from 'vitest'
import { BaseReldbCrudRepository, reldb } from '../src/index.js'
import { HaiReldbError } from '../src/reldb-types.js'
import { defineDbSuite, mysqlDockerOpts, mysqlEnv, postgresDockerOpts, postgresEnv, sqliteMemoryEnv } from './helpers/reldb-test-suite.js'

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

const USER_FIELDS: ReldbCrudFieldDefinition[] = [
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

const API_KEY_FIELDS: ReldbCrudFieldDefinition[] = [
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

class UserRepository extends BaseReldbCrudRepository<UserRow> {
  constructor() {
    super(reldb, {
      table: 'users',
      idColumn: 'id',
      fields: USER_FIELDS,
    })
  }

  async findByEmail(email: string) {
    return this.findAll({ where: 'email = ?', params: [email], limit: 1 })
  }

  async insertRaw(data: { name: string, email: string, enabled?: boolean }, tx?: import('../src/index.js').DmlWithTxOperations) {
    const isSqlite = reldb.config?.type === 'sqlite'
    const now = isSqlite ? Date.now() : new Date()
    const enabledValue = data.enabled ?? true
    const normalizedEnabled = isSqlite ? (enabledValue ? 1 : 0) : enabledValue
    return this.sql(tx).execute(
      'INSERT INTO users (name, email, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [data.name, data.email, normalizedEnabled, now, now],
    )
  }
}

class ApiKeyRepository extends BaseReldbCrudRepository<ApiKeyRow> {
  private idCounter = 0

  constructor() {
    super(reldb, {
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

describe('db.BaseReldbCrudRepository', () => {
  const defineCommon = (label: 'sqlite' | 'mysql' | 'postgresql') => {
    const ensureTable = async () => {
      await reldb.ddl.dropTable('users', true)
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
        expect(updateResult.error.code).toBe(HaiReldbError.CONFIG_ERROR.code)
      }
    })

    it(`${label}: should generate ids for string primary keys`, async () => {
      await reldb.ddl.dropTable('api_keys', true)
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
      await reldb.ddl.dropTable('users', true)
      await reldb.ddl.dropTable('api_keys', true)

      const userRepo = new UserRepository()
      const apiKeyRepo = new ApiKeyRepository()

      const txResult = await reldb.tx.begin()
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

      const txResult = await reldb.tx.begin()
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

    it(`${label}: createOrUpdate should insert when record does not exist`, async () => {
      await reldb.ddl.dropTable('api_keys', true)
      const repo = new ApiKeyRepository()

      const result = await repo.createOrUpdate({ id: 'key-upsert-1', name: 'new-key' })
      expect(result.success).toBe(true)

      const found = await repo.findById('key-upsert-1')
      expect(found.success).toBe(true)
      if (found.success) {
        expect(found.data).not.toBeNull()
        expect(found.data!.name).toBe('new-key')
      }
    })

    it(`${label}: createOrUpdate should update when record exists`, async () => {
      await reldb.ddl.dropTable('api_keys', true)
      const repo = new ApiKeyRepository()

      const createResult = await repo.create({ id: 'key-upsert-2', name: 'original' })
      expect(createResult.success).toBe(true)

      const before = await repo.findById('key-upsert-2')
      expect(before.success).toBe(true)

      await new Promise(resolve => setTimeout(resolve, 5))

      const upsertResult = await repo.createOrUpdate({ id: 'key-upsert-2', name: 'updated' })
      expect(upsertResult.success).toBe(true)

      const after = await repo.findById('key-upsert-2')
      expect(after.success).toBe(true)
      if (after.success && after.data) {
        expect(after.data.name).toBe('updated')
      }

      // 仅有一条记录
      const count = await repo.count()
      expect(count.success).toBe(true)
      if (count.success) {
        expect(count.data).toBe(1)
      }
    })

    it(`${label}: createOrUpdate should preserve createdAt on update`, async () => {
      await ensureTable()
      const repo = new UserRepository()

      const createResult = await repo.create({ name: '用户UP', email: 'up@test.com' })
      expect(createResult.success).toBe(true)

      const before = await repo.findById(1)
      expect(before.success).toBe(true)

      await new Promise(resolve => setTimeout(resolve, 5))

      const upsertResult = await repo.createOrUpdate({ id: 1, name: '用户UP-更新', email: 'up@test.com' })
      expect(upsertResult.success).toBe(true)

      const after = await repo.findById(1)
      expect(after.success).toBe(true)
      if (before.success && after.success && before.data && after.data) {
        // createdAt 不变
        expect(after.data.createdAt.getTime()).toBe(before.data.createdAt.getTime())
        // updatedAt 被更新
        expect(after.data.updatedAt.getTime()).toBeGreaterThanOrEqual(before.data.updatedAt.getTime())
        expect(after.data.name).toBe('用户UP-更新')
      }
    })

    it(`${label}: createOrUpdate should work within transaction`, async () => {
      await reldb.ddl.dropTable('api_keys', true)
      const repo = new ApiKeyRepository()

      const txResult = await reldb.tx.begin()
      expect(txResult.success).toBe(true)
      if (!txResult.success) {
        return
      }

      const tx = txResult.data
      await repo.createOrUpdate({ id: 'key-tx-1', name: 'tx-key' }, tx)

      const rollbackResult = await tx.rollback()
      expect(rollbackResult.success).toBe(true)

      const afterCount = await repo.count()
      expect(afterCount.success).toBe(true)
      if (afterCount.success) {
        expect(afterCount.data).toBe(0)
      }
    })

    it(`${label}: createOrUpdate should not overwrite fields outside updateColumns`, async () => {
      await ensureTable()
      const repo = new UserRepository()

      // 首次插入：enabled = false
      const createResult = await repo.create({ name: '用户WL', email: 'wl@test.com', enabled: false })
      expect(createResult.success).toBe(true)

      // upsert 只更新 name/email（enabled 是 update: true 但不传值则不会更新）
      const upsertResult = await repo.createOrUpdate({ id: 1, name: '用户WL-更新', email: 'wl@test.com' })
      expect(upsertResult.success).toBe(true)

      const after = await repo.findById(1)
      expect(after.success).toBe(true)
      if (after.success && after.data) {
        expect(after.data.name).toBe('用户WL-更新')
        // enabled 未传入，不应被覆盖（保持 false）
        expect(after.data.enabled).toBe(false)
      }
    })

    it(`${label}: createOrUpdate should not overwrite default values on conflict`, async () => {
      await ensureTable()
      const repo = new UserRepository()

      // 首次插入：enabled 使用 buildCreatePayload 的默认值 true
      const createResult = await repo.create({ name: '用户DV', email: 'dv@test.com' })
      expect(createResult.success).toBe(true)

      const before = await repo.findById(1)
      expect(before.success).toBe(true)
      if (before.success && before.data) {
        expect(before.data.enabled).toBe(true)
      }

      // 手动设置 enabled = false
      const updateResult = await repo.updateById(1, { enabled: false })
      expect(updateResult.success).toBe(true)

      // upsert 不传 enabled：不应用 INSERT 的默认值 true 覆盖现有的 false
      const upsertResult = await repo.createOrUpdate({ id: 1, name: '用户DV-更新', email: 'dv@test.com' })
      expect(upsertResult.success).toBe(true)

      const after = await repo.findById(1)
      expect(after.success).toBe(true)
      if (after.success && after.data) {
        expect(after.data.name).toBe('用户DV-更新')
        // enabled 应保持 false，不被 INSERT 默认值覆盖
        expect(after.data.enabled).toBe(false)
      }
    })

    it(`${label}: createOrUpdate with empty data should fail`, async () => {
      await ensureTable()
      const repo = new UserRepository()

      // 不传任何业务字段：buildCreatePayload 仍会填充默认值和时间戳，
      // 但 notNull 的 name/email 未提供会触发数据库约束错误
      const result = await repo.createOrUpdate({})
      expect(result.success).toBe(false)
    })

    it(`${label}: createOrUpdate multiple times should keep only one record`, async () => {
      await reldb.ddl.dropTable('api_keys', true)
      const repo = new ApiKeyRepository()

      await repo.createOrUpdate({ id: 'key-multi', name: 'v1' })
      await repo.createOrUpdate({ id: 'key-multi', name: 'v2' })
      await repo.createOrUpdate({ id: 'key-multi', name: 'v3' })

      const count = await repo.count()
      expect(count.success).toBe(true)
      if (count.success) {
        expect(count.data).toBe(1)
      }

      const found = await repo.findById('key-multi')
      expect(found.success).toBe(true)
      if (found.success && found.data) {
        expect(found.data.name).toBe('v3')
      }
    })

    // ─── getById（Repository 层） ───

    it(`${label}: getById should return record when exists`, async () => {
      await ensureTable()
      const repo = new UserRepository()

      await repo.create({ name: '用户G', email: 'g@test.com', enabled: true })

      const result = await repo.getById(1)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.name).toBe('用户G')
      }
    })

    it(`${label}: getById non-existent should return RECORD_NOT_FOUND`, async () => {
      await ensureTable()
      const repo = new UserRepository()

      const result = await repo.getById(999)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiReldbError.RECORD_NOT_FOUND.code)
      }
    })
  }

  defineDbSuite('sqlite', sqliteMemoryEnv, () => defineCommon('sqlite'))

  defineDbSuite('mysql', mysqlEnv, () => defineCommon('mysql'), mysqlDockerOpts)

  defineDbSuite('postgresql', postgresEnv, () => defineCommon('postgresql'), postgresDockerOpts)
})
