/**
 * =============================================================================
 * @h-ai/reldb - CRUD 抽象边界测试
 * =============================================================================
 *
 * 覆盖 reldb.crud.table() 的边界场景：
 * - 空 payload / 无效 payload 报错
 * - createColumns / updateColumns 白名单过滤
 * - createMany 含空项
 * - findAll 的 limit + offset 组合
 * - exists 匹配 / 不匹配
 * - mapRow 自定义行映射
 * - findPage 的 overrides 自定义
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { HaiReldbError, reldb } from '../src/index.js'
import { defineDbSuite, mysqlDockerOpts, mysqlEnv, postgresDockerOpts, postgresEnv, sqliteMemoryEnv } from './helpers/reldb-test-suite.js'

interface UserRow {
  id: number
  name: string
  email: string
}

describe('reldb.crud edge cases', () => {
  const defineCommon = (label: 'sqlite' | 'mysql' | 'postgresql') => {
    const ensureTable = async () => {
      await reldb.ddl.dropTable('users', true)
      const r = await reldb.ddl.createTable('users', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        name: { type: 'TEXT', notNull: true },
        email: { type: 'TEXT', notNull: true },
        status: { type: 'TEXT' },
      })
      expect(r.success).toBe(true)
    }

    // ─── 空 payload ───

    it(`${label}: create 空对象应返回 CONFIG_ERROR`, async () => {
      await ensureTable()
      const crud = reldb.crud.table<UserRow>({
        table: 'users',
        idColumn: 'id',
        createColumns: ['name', 'email'],
        dbType: label,
      })

      const result = await crud.create({})
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiReldbError.CONFIG_ERROR.code)
      }
    })

    it(`${label}: updateById 空对象应返回 CONFIG_ERROR`, async () => {
      await ensureTable()
      const crud = reldb.crud.table<UserRow>({
        table: 'users',
        idColumn: 'id',
        updateColumns: ['name', 'email'],
        dbType: label,
      })

      const result = await crud.updateById(1, {})
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiReldbError.CONFIG_ERROR.code)
      }
    })

    // ─── 白名单过滤后无有效列 ───

    it(`${label}: create 传入字段全部不在 createColumns 中应返回 CONFIG_ERROR`, async () => {
      await ensureTable()
      const crud = reldb.crud.table<UserRow>({
        table: 'users',
        idColumn: 'id',
        createColumns: ['name', 'email'],
        dbType: label,
      })

      // 传入 status 字段，但 createColumns 不包含 status
      const result = await crud.create({ status: 'active' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiReldbError.CONFIG_ERROR.code)
      }
    })

    it(`${label}: updateById 传入字段全部不在 updateColumns 中应返回 CONFIG_ERROR`, async () => {
      await ensureTable()
      const crud = reldb.crud.table<UserRow>({
        table: 'users',
        idColumn: 'id',
        updateColumns: ['name'],
        dbType: label,
      })

      // 只传入 email，但 updateColumns 仅含 name
      const result = await crud.updateById(1, { email: 'new@test.com' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiReldbError.CONFIG_ERROR.code)
      }
    })

    it(`${label}: updateById 尝试更新主键列应被自动排除`, async () => {
      await ensureTable()
      const crud = reldb.crud.table<UserRow>({
        table: 'users',
        idColumn: 'id',
        updateColumns: ['id', 'name'],
        dbType: label,
      })

      // 先插入一条记录
      const create = await crud.create({ name: '用户1', email: 'u1@test.com' })
      expect(create.success).toBe(true)

      // 仅传入 id 字段（会被排除），应返回 CONFIG_ERROR
      const result = await crud.updateById(1, { id: 999 })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiReldbError.CONFIG_ERROR.code)
      }
    })

    // ─── createMany 边界 ───

    it(`${label}: createMany 含空对象的项应返回 CONFIG_ERROR`, async () => {
      await ensureTable()
      const crud = reldb.crud.table<UserRow>({
        table: 'users',
        idColumn: 'id',
        createColumns: ['name', 'email'],
        dbType: label,
      })

      const result = await crud.createMany([
        { name: '用户1', email: 'u1@test.com' },
        {},
      ])
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiReldbError.CONFIG_ERROR.code)
      }
    })

    it(`${label}: createMany 空数组应直接成功`, async () => {
      await ensureTable()
      const crud = reldb.crud.table<UserRow>({
        table: 'users',
        idColumn: 'id',
        createColumns: ['name', 'email'],
        dbType: label,
      })

      const result = await crud.createMany([])
      expect(result.success).toBe(true)
    })

    // ─── findAll limit + offset ───

    it(`${label}: findAll 使用 limit + offset 应正确分段`, async () => {
      await ensureTable()
      const crud = reldb.crud.table<UserRow>({
        table: 'users',
        idColumn: 'id',
        select: ['id', 'name', 'email'],
        createColumns: ['name', 'email'],
        dbType: label,
      })

      // 插入 5 条数据
      for (let i = 1; i <= 5; i++) {
        await crud.create({ name: `用户${i}`, email: `u${i}@test.com` })
      }

      // 取第 2~3 条 (offset=1, limit=2)
      const result = await crud.findAll({
        orderBy: 'id ASC',
        limit: 2,
        offset: 1,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveLength(2)
        expect(result.data[0].name).toBe('用户2')
        expect(result.data[1].name).toBe('用户3')
      }
    })

    it(`${label}: findAll offset 超出总数应返回空数组`, async () => {
      await ensureTable()
      const crud = reldb.crud.table<UserRow>({
        table: 'users',
        idColumn: 'id',
        select: ['id', 'name', 'email'],
        createColumns: ['name', 'email'],
        dbType: label,
      })

      await crud.create({ name: '用户1', email: 'u1@test.com' })

      const result = await crud.findAll({ offset: 100, limit: 10 })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual([])
      }
    })

    // ─── exists 匹配 ───

    it(`${label}: exists 有匹配记录应返回 true`, async () => {
      await ensureTable()
      const crud = reldb.crud.table<UserRow>({
        table: 'users',
        idColumn: 'id',
        select: ['id', 'name', 'email'],
        createColumns: ['name', 'email'],
        dbType: label,
      })

      await crud.create({ name: '用户1', email: 'u1@test.com' })

      const result = await crud.exists({ where: 'email = ?', params: ['u1@test.com'] })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(true)
      }
    })

    it(`${label}: exists 无匹配记录应返回 false`, async () => {
      await ensureTable()
      const crud = reldb.crud.table<UserRow>({
        table: 'users',
        idColumn: 'id',
        select: ['id', 'name', 'email'],
        createColumns: ['name', 'email'],
        dbType: label,
      })

      await crud.create({ name: '用户1', email: 'u1@test.com' })

      const result = await crud.exists({ where: 'email = ?', params: ['nobody@test.com'] })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(false)
      }
    })

    // ─── mapRow 自定义行映射 ───

    it(`${label}: mapRow 自定义映射应在 findAll/findById 生效`, async () => {
      await ensureTable()

      interface MappedUser {
        userId: number
        displayName: string
      }

      const crud = reldb.crud.table<MappedUser>({
        table: 'users',
        idColumn: 'id',
        select: ['id', 'name'],
        createColumns: ['name', 'email'],
        dbType: label,
        mapRow: row => ({
          userId: Number(row.id),
          displayName: `【${row.name as string}】`,
        }),
      })

      await crud.create({ name: '张三', email: 'z@test.com' })

      const byId = await crud.findById(1)
      expect(byId.success).toBe(true)
      if (byId.success) {
        expect(byId.data).not.toBeNull()
        expect(byId.data!.userId).toBe(1)
        expect(byId.data!.displayName).toBe('【张三】')
      }

      const all = await crud.findAll()
      expect(all.success).toBe(true)
      if (all.success) {
        expect(all.data).toHaveLength(1)
        expect(all.data[0].displayName).toBe('【张三】')
      }
    })

    // ─── findPage overrides ───

    it(`${label}: findPage 使用 overrides 自定义默认分页`, async () => {
      await ensureTable()
      const crud = reldb.crud.table<UserRow>({
        table: 'users',
        idColumn: 'id',
        select: ['id', 'name', 'email'],
        createColumns: ['name', 'email'],
        dbType: label,
      })

      for (let i = 1; i <= 10; i++) {
        await crud.create({ name: `用户${i}`, email: `u${i}@test.com` })
      }

      // 不提供 pagination，让 overrides 生效
      const result = await crud.findPage({
        orderBy: 'id ASC',
        overrides: { defaultPageSize: 3 },
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.total).toBe(10)
        expect(result.data.pageSize).toBe(3)
        expect(result.data.items).toHaveLength(3)
      }
    })

    it(`${label}: findPage 第二页应返回正确数据`, async () => {
      await ensureTable()
      const crud = reldb.crud.table<UserRow>({
        table: 'users',
        idColumn: 'id',
        select: ['id', 'name', 'email'],
        createColumns: ['name', 'email'],
        dbType: label,
      })

      for (let i = 1; i <= 5; i++) {
        await crud.create({ name: `用户${i}`, email: `u${i}@test.com` })
      }

      const page2 = await crud.findPage({
        orderBy: 'id ASC',
        pagination: { page: 2, pageSize: 2 },
      })
      expect(page2.success).toBe(true)
      if (page2.success) {
        expect(page2.data.total).toBe(5)
        expect(page2.data.page).toBe(2)
        expect(page2.data.items).toHaveLength(2)
        expect(page2.data.items[0].name).toBe('用户3')
        expect(page2.data.items[1].name).toBe('用户4')
      }
    })

    it(`${label}: findPage with where 应只统计过滤后的总数`, async () => {
      await ensureTable()
      const crud = reldb.crud.table<UserRow>({
        table: 'users',
        idColumn: 'id',
        select: ['id', 'name', 'email'],
        createColumns: ['name', 'email', 'status'],
        dbType: label,
      })

      await crud.create({ name: '用户A', email: 'a@test.com', status: 'active' })
      await crud.create({ name: '用户B', email: 'b@test.com', status: 'inactive' })
      await crud.create({ name: '用户C', email: 'c@test.com', status: 'active' })
      await crud.create({ name: '用户D', email: 'd@test.com', status: 'active' })

      const result = await crud.findPage({
        where: 'status = ?',
        params: ['active'],
        orderBy: 'id ASC',
        pagination: { page: 1, pageSize: 2 },
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.total).toBe(3)
        expect(result.data.items).toHaveLength(2)
      }
    })

    // ─── 无 createColumns / updateColumns 白名单时应接受任意字段 ───

    it(`${label}: 不指定 createColumns 时应接受所有字段`, async () => {
      await ensureTable()
      const crud = reldb.crud.table<UserRow>({
        table: 'users',
        idColumn: 'id',
        select: ['id', 'name', 'email'],
        dbType: label,
        // 不指定 createColumns
      })

      const result = await crud.create({ name: '用户1', email: 'u1@test.com', status: 'active' })
      expect(result.success).toBe(true)

      const check = await reldb.sql.get<{ status: string }>('SELECT status FROM users WHERE id = 1')
      expect(check.success).toBe(true)
      if (check.success) {
        expect(check.data?.status).toBe('active')
      }
    })
  }

  defineDbSuite('sqlite', sqliteMemoryEnv, () => defineCommon('sqlite'))

  defineDbSuite('mysql', mysqlEnv, () => defineCommon('mysql'), mysqlDockerOpts)

  defineDbSuite('postgresql', postgresEnv, () => defineCommon('postgresql'), postgresDockerOpts)
})
