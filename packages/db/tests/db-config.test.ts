/**
 * =============================================================================
 * @h-ai/db - 配置校验与分页工具测试
 * =============================================================================
 *
 * 纯函数测试，不需要数据库连接。
 * 覆盖：DbConfigSchema 校验、db.pagination 工具函数。
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { db, DbConfigSchema } from '../src/index.js'

// =============================================================================
// DbConfigSchema 校验
// =============================================================================

describe('dbConfigSchema', () => {
  it('应校验通过有效的 sqlite 配置', () => {
    const result = DbConfigSchema.parse({
      type: 'sqlite',
      database: ':memory:',
    })
    expect(result.type).toBe('sqlite')
    expect(result.database).toBe(':memory:')
  })

  it('应校验通过 sqlite 配置并填充默认值', () => {
    const result = DbConfigSchema.parse({
      type: 'sqlite',
      database: './data.db',
      sqlite: {},
    })
    expect(result.type).toBe('sqlite')
    expect(result.sqlite?.walMode).toBe(true)
    expect(result.sqlite?.readonly).toBe(false)
  })

  it('应校验通过有效的 postgresql 配置', () => {
    const result = DbConfigSchema.parse({
      type: 'postgresql',
      database: 'testdb',
      host: '127.0.0.1',
      port: 5432,
      user: 'admin',
      password: 'secret',
    })
    expect(result.type).toBe('postgresql')
    expect(result.database).toBe('testdb')
    expect(result.host).toBe('127.0.0.1')
  })

  it('应校验通过 postgresql 配置并使用 pool 默认值', () => {
    const result = DbConfigSchema.parse({
      type: 'postgresql',
      database: 'testdb',
      pool: {},
    })
    expect(result.pool?.min).toBe(1)
    expect(result.pool?.max).toBe(10)
    expect(result.pool?.idleTimeout).toBe(30000)
    expect(result.pool?.acquireTimeout).toBe(10000)
  })

  it('应校验通过有效的 mysql 配置', () => {
    const result = DbConfigSchema.parse({
      type: 'mysql',
      database: 'testdb',
      host: '127.0.0.1',
      port: 3306,
      user: 'root',
      password: 'pass',
    })
    expect(result.type).toBe('mysql')
    expect(result.database).toBe('testdb')
  })

  it('应校验通过 mysql 配置并填充 charset 默认值', () => {
    const result = DbConfigSchema.parse({
      type: 'mysql',
      database: 'testdb',
      mysql: {},
    })
    expect(result.mysql?.charset).toBe('utf8mb4')
  })

  it('缺少 type 字段应抛出校验错误', () => {
    expect(() => DbConfigSchema.parse({ database: ':memory:' })).toThrow()
  })

  it('无效的 type 值应抛出校验错误', () => {
    expect(() => DbConfigSchema.parse({ type: 'oracle', database: 'test' })).toThrow()
  })

  it('sqlite 缺少 database 字段应抛出校验错误', () => {
    expect(() => DbConfigSchema.parse({ type: 'sqlite' })).toThrow()
  })

  it('postgresql 缺少 database 字段应抛出校验错误', () => {
    expect(() => DbConfigSchema.parse({ type: 'postgresql', host: 'localhost' })).toThrow()
  })

  it('mysql 缺少 database 字段应抛出校验错误', () => {
    expect(() => DbConfigSchema.parse({ type: 'mysql', host: 'localhost' })).toThrow()
  })

  it('port 超出范围应抛出校验错误', () => {
    expect(() => DbConfigSchema.parse({
      type: 'postgresql',
      database: 'test',
      port: 99999,
    })).toThrow()
  })

  it('pool.max 小于 1 应抛出校验错误', () => {
    expect(() => DbConfigSchema.parse({
      type: 'postgresql',
      database: 'test',
      pool: { max: 0 },
    })).toThrow()
  })

  it('应支持 ssl 布尔值', () => {
    const result = DbConfigSchema.parse({
      type: 'postgresql',
      database: 'test',
      ssl: true,
    })
    expect(result.ssl).toBe(true)
  })

  it('应支持 ssl 模式字符串', () => {
    const result = DbConfigSchema.parse({
      type: 'postgresql',
      database: 'test',
      ssl: 'require',
    })
    expect(result.ssl).toBe('require')
  })

  it('应支持 ssl 对象', () => {
    const result = DbConfigSchema.parse({
      type: 'postgresql',
      database: 'test',
      ssl: { rejectUnauthorized: false },
    })
    expect(result.ssl).toEqual({ rejectUnauthorized: false })
  })
})

// =============================================================================
// db.pagination 工具函数
// =============================================================================

describe('db.pagination', () => {
  describe('normalize', () => {
    it('无参数时应返回默认值', () => {
      const result = db.pagination.normalize()
      expect(result.page).toBe(1)
      expect(result.pageSize).toBe(20)
      expect(result.offset).toBe(0)
      expect(result.limit).toBe(20)
    })

    it('应正确计算 offset', () => {
      const result = db.pagination.normalize({ page: 3, pageSize: 10 })
      expect(result.page).toBe(3)
      expect(result.pageSize).toBe(10)
      expect(result.offset).toBe(20)
      expect(result.limit).toBe(10)
    })

    it('page=0 应回退到默认页码', () => {
      const result = db.pagination.normalize({ page: 0, pageSize: 10 })
      expect(result.page).toBe(1)
      expect(result.offset).toBe(0)
    })

    it('负数 page 应回退到默认页码', () => {
      const result = db.pagination.normalize({ page: -5, pageSize: 10 })
      expect(result.page).toBe(1)
      expect(result.offset).toBe(0)
    })

    it('pageSize=0 应回退到默认值', () => {
      const result = db.pagination.normalize({ page: 1, pageSize: 0 })
      expect(result.pageSize).toBe(20)
    })

    it('负数 pageSize 应回退到默认值', () => {
      const result = db.pagination.normalize({ page: 1, pageSize: -10 })
      expect(result.pageSize).toBe(20)
    })

    it('超出 maxPageSize 应被截断到 200', () => {
      const result = db.pagination.normalize({ page: 1, pageSize: 500 })
      expect(result.pageSize).toBe(200)
      expect(result.limit).toBe(200)
    })

    it('小数 page 应向下取整', () => {
      const result = db.pagination.normalize({ page: 2.7, pageSize: 10 })
      expect(result.page).toBe(2)
      expect(result.offset).toBe(10)
    })

    it('小数 pageSize 应向下取整', () => {
      const result = db.pagination.normalize({ page: 1, pageSize: 15.9 })
      expect(result.pageSize).toBe(15)
      expect(result.limit).toBe(15)
    })

    it('应支持自定义 overrides', () => {
      const result = db.pagination.normalize(undefined, {
        defaultPage: 2,
        defaultPageSize: 50,
        maxPageSize: 100,
      })
      expect(result.page).toBe(2)
      expect(result.pageSize).toBe(50)
      expect(result.offset).toBe(50)
    })

    it('overrides 的 maxPageSize 应生效', () => {
      const result = db.pagination.normalize({ page: 1, pageSize: 80 }, {
        maxPageSize: 50,
      })
      expect(result.pageSize).toBe(50)
    })
  })

  describe('build', () => {
    it('应正确构建分页结果', () => {
      const result = db.pagination.build(
        [{ id: 1 }, { id: 2 }],
        5,
        { page: 1, pageSize: 2 },
      )
      expect(result.items).toHaveLength(2)
      expect(result.total).toBe(5)
      expect(result.page).toBe(1)
      expect(result.pageSize).toBe(2)
    })

    it('空列表应返回空 items', () => {
      const result = db.pagination.build(
        [],
        0,
        { page: 1, pageSize: 20 },
      )
      expect(result.items).toHaveLength(0)
      expect(result.total).toBe(0)
    })
  })
})
