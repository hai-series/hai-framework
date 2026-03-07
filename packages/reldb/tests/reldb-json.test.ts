/**
 * =============================================================================
 * @h-ai/reldb - JSON 操作 SQL 构建器测试
 * =============================================================================
 *
 * 覆盖 reldb-json 模块的 JSON SQL 表达式构建功能：
 * - parseJsonPath：JSON Path 解析
 * - createJsonOps('sqlite')：SQLite JSON 函数
 * - createJsonOps('postgresql')：PostgreSQL JSONB 操作符
 * - createJsonOps('mysql')：MySQL JSON 函数
 * - reldb.json：集成入口（database-type-aware）
 * =============================================================================
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createJsonOps, parseJsonPath, reldb } from '../src/index.js'

// =============================================================================
// parseJsonPath 单元测试
// =============================================================================

describe('parseJsonPath', () => {
  it('解析单层对象字段', () => {
    expect(parseJsonPath('$.status')).toEqual(['status'])
  })

  it('解析多层对象字段', () => {
    expect(parseJsonPath('$.user.name')).toEqual(['user', 'name'])
  })

  it('解析三层对象字段', () => {
    expect(parseJsonPath('$.a.b.c')).toEqual(['a', 'b', 'c'])
  })

  it('解析数组索引', () => {
    expect(parseJsonPath('$[0]')).toEqual(['0'])
  })

  it('解析对象字段后跟数组索引', () => {
    expect(parseJsonPath('$.items[0]')).toEqual(['items', '0'])
  })

  it('解析混合路径', () => {
    expect(parseJsonPath('$.items[1].name')).toEqual(['items', '1', 'name'])
  })

  it('解析双引号数组键', () => {
    expect(parseJsonPath('$["key"]')).toEqual(['key'])
  })

  it('路径不含 $ 前缀时也能解析', () => {
    expect(parseJsonPath('.status')).toEqual(['status'])
  })

  it('路径为 $ 时返回空数组', () => {
    expect(parseJsonPath('$')).toEqual([])
  })
})

// =============================================================================
// SQLite JSON 操作构建器测试
// =============================================================================

describe('createJsonOps(sqlite)', () => {
  const json = createJsonOps('sqlite')

  describe('extract', () => {
    it('生成 json_extract 表达式', () => {
      const { sql, params } = json.extract('data', '$.status')
      expect(sql).toBe('json_extract(data, ?)')
      expect(params).toEqual(['$.status'])
    })

    it('支持嵌套路径', () => {
      const { sql, params } = json.extract('data', '$.user.name')
      expect(sql).toBe('json_extract(data, ?)')
      expect(params).toEqual(['$.user.name'])
    })

    it('支持数组索引路径', () => {
      const { sql, params } = json.extract('data', '$.items[0]')
      expect(sql).toBe('json_extract(data, ?)')
      expect(params).toEqual(['$.items[0]'])
    })
  })

  describe('set', () => {
    it('生成 json_set + json() 表达式（字符串值）', () => {
      const { sql, params } = json.set('settings', '$.theme', 'dark')
      expect(sql).toBe('json_set(settings, ?, json(?))')
      expect(params).toEqual(['$.theme', '"dark"'])
    })

    it('生成 json_set 表达式（数值）', () => {
      const { sql, params } = json.set('data', '$.count', 42)
      expect(sql).toBe('json_set(data, ?, json(?))')
      expect(params).toEqual(['$.count', '42'])
    })

    it('生成 json_set 表达式（对象值）', () => {
      const { sql, params } = json.set('data', '$.meta', { key: 'val' })
      expect(sql).toBe('json_set(data, ?, json(?))')
      expect(params).toEqual(['$.meta', '{"key":"val"}'])
    })

    it('生成 json_set 表达式（null 值）', () => {
      const { sql, params } = json.set('data', '$.field', null)
      expect(sql).toBe('json_set(data, ?, json(?))')
      expect(params).toEqual(['$.field', 'null'])
    })

    it('生成 json_set 表达式（布尔值）', () => {
      const { sql, params } = json.set('data', '$.active', true)
      expect(sql).toBe('json_set(data, ?, json(?))')
      expect(params).toEqual(['$.active', 'true'])
    })
  })

  describe('insert', () => {
    it('生成 json_insert 表达式', () => {
      const { sql, params } = json.insert('data', '$.newKey', 'value')
      expect(sql).toBe('json_insert(data, ?, json(?))')
      expect(params).toEqual(['$.newKey', '"value"'])
    })
  })

  describe('remove', () => {
    it('生成 json_remove 表达式', () => {
      const { sql, params } = json.remove('settings', '$.deprecated')
      expect(sql).toBe('json_remove(settings, ?)')
      expect(params).toEqual(['$.deprecated'])
    })

    it('支持嵌套路径', () => {
      const { sql, params } = json.remove('data', '$.user.avatar')
      expect(sql).toBe('json_remove(data, ?)')
      expect(params).toEqual(['$.user.avatar'])
    })
  })

  describe('merge', () => {
    it('生成 json_patch 表达式', () => {
      const { sql, params } = json.merge('profile', { bio: 'new bio', avatar: null })
      expect(sql).toBe('json_patch(profile, ?)')
      expect(params).toEqual(['{"bio":"new bio","avatar":null}'])
    })

    it('空对象补丁', () => {
      const { sql, params } = json.merge('data', {})
      expect(sql).toBe('json_patch(data, ?)')
      expect(params).toEqual(['{}'])
    })
  })
})

// =============================================================================
// PostgreSQL JSON 操作构建器测试
// =============================================================================

describe('createJsonOps(postgresql)', () => {
  const json = createJsonOps('postgresql')

  describe('extract', () => {
    it('生成 #> 表达式（单层路径）', () => {
      const { sql, params } = json.extract('data', '$.status')
      expect(sql).toBe('data #> ?::text[]')
      expect(params).toEqual([['status']])
    })

    it('生成 #> 表达式（多层路径）', () => {
      const { sql, params } = json.extract('data', '$.user.name')
      expect(sql).toBe('data #> ?::text[]')
      expect(params).toEqual([['user', 'name']])
    })

    it('支持数组索引路径', () => {
      const { sql, params } = json.extract('data', '$.items[0]')
      expect(sql).toBe('data #> ?::text[]')
      expect(params).toEqual([['items', '0']])
    })
  })

  describe('set', () => {
    it('生成 jsonb_set 表达式（字符串值）', () => {
      const { sql, params } = json.set('settings', '$.theme', 'dark')
      expect(sql).toBe('jsonb_set(settings, ?::text[], ?::jsonb)')
      expect(params).toEqual([['theme'], '"dark"'])
    })

    it('生成 jsonb_set 表达式（多层路径）', () => {
      const { sql, params } = json.set('data', '$.user.age', 30)
      expect(sql).toBe('jsonb_set(data, ?::text[], ?::jsonb)')
      expect(params).toEqual([['user', 'age'], '30'])
    })

    it('生成 jsonb_set 表达式（对象值）', () => {
      const { sql, params } = json.set('data', '$.meta', { k: 'v' })
      expect(sql).toBe('jsonb_set(data, ?::text[], ?::jsonb)')
      expect(params).toEqual([['meta'], '{"k":"v"}'])
    })
  })

  describe('insert', () => {
    it('生成 jsonb_insert 表达式', () => {
      const { sql, params } = json.insert('data', '$.newKey', 'value')
      expect(sql).toBe('jsonb_insert(data, ?::text[], ?::jsonb)')
      expect(params).toEqual([['newKey'], '"value"'])
    })
  })

  describe('remove', () => {
    it('生成 #- 表达式（单层路径）', () => {
      const { sql, params } = json.remove('settings', '$.deprecated')
      expect(sql).toBe('settings #- ?::text[]')
      expect(params).toEqual([['deprecated']])
    })

    it('生成 #- 表达式（多层路径）', () => {
      const { sql, params } = json.remove('data', '$.user.avatar')
      expect(sql).toBe('data #- ?::text[]')
      expect(params).toEqual([['user', 'avatar']])
    })
  })

  describe('merge', () => {
    it('生成 || ::jsonb 表达式', () => {
      const { sql, params } = json.merge('profile', { bio: 'new', avatar: null })
      expect(sql).toBe('profile || ?::jsonb')
      expect(params).toEqual(['{"bio":"new","avatar":null}'])
    })
  })
})

// =============================================================================
// MySQL JSON 操作构建器测试
// =============================================================================

describe('createJsonOps(mysql)', () => {
  const json = createJsonOps('mysql')

  describe('extract', () => {
    it('生成 JSON_EXTRACT 表达式', () => {
      const { sql, params } = json.extract('data', '$.status')
      expect(sql).toBe('JSON_EXTRACT(data, ?)')
      expect(params).toEqual(['$.status'])
    })

    it('支持嵌套路径', () => {
      const { sql, params } = json.extract('data', '$.user.name')
      expect(sql).toBe('JSON_EXTRACT(data, ?)')
      expect(params).toEqual(['$.user.name'])
    })
  })

  describe('set', () => {
    it('生成 JSON_SET + CAST AS JSON 表达式（字符串值）', () => {
      const { sql, params } = json.set('settings', '$.theme', 'dark')
      expect(sql).toBe('JSON_SET(settings, ?, CAST(? AS JSON))')
      expect(params).toEqual(['$.theme', '"dark"'])
    })

    it('生成 JSON_SET 表达式（对象值）', () => {
      const { sql, params } = json.set('data', '$.meta', { key: 'val' })
      expect(sql).toBe('JSON_SET(data, ?, CAST(? AS JSON))')
      expect(params).toEqual(['$.meta', '{"key":"val"}'])
    })
  })

  describe('insert', () => {
    it('生成 JSON_INSERT 表达式', () => {
      const { sql, params } = json.insert('data', '$.newKey', 'value')
      expect(sql).toBe('JSON_INSERT(data, ?, CAST(? AS JSON))')
      expect(params).toEqual(['$.newKey', '"value"'])
    })
  })

  describe('remove', () => {
    it('生成 JSON_REMOVE 表达式', () => {
      const { sql, params } = json.remove('settings', '$.deprecated')
      expect(sql).toBe('JSON_REMOVE(settings, ?)')
      expect(params).toEqual(['$.deprecated'])
    })
  })

  describe('merge', () => {
    it('生成 JSON_MERGE_PATCH + CAST AS JSON 表达式', () => {
      const { sql, params } = json.merge('profile', { bio: 'new', avatar: null })
      expect(sql).toBe('JSON_MERGE_PATCH(profile, CAST(? AS JSON))')
      expect(params).toEqual(['{"bio":"new","avatar":null}'])
    })
  })
})

// =============================================================================
// reldb.json 集成测试（SQLite）
// =============================================================================

describe('reldb.json 集成测试（SQLite）', () => {
  beforeEach(async () => {
    await reldb.close()
    await reldb.init({ type: 'sqlite', database: ':memory:' })
    await reldb.ddl.createTable('items', {
      id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
      data: { type: 'JSON' },
    })
    await reldb.sql.execute(
      `INSERT INTO items (data) VALUES (json(?))`,
      [JSON.stringify({ status: 'active', count: 5, tags: ['a', 'b'], meta: { v: 1 } })],
    )
  })

  afterEach(async () => {
    await reldb.close()
  })

  it('reldb.json 初始化后返回 sqlite 类型的构建器', () => {
    const { sql, params } = reldb.json.extract('data', '$.status')
    expect(sql).toBe('json_extract(data, ?)')
    expect(params).toEqual(['$.status'])
  })

  it('extract：提取 JSON 字段值', async () => {
    const { sql, params } = reldb.json.extract('data', '$.status')
    const result = await reldb.sql.query<{ v: string }>(
      `SELECT ${sql} as v FROM items WHERE id = 1`,
      params,
    )
    expect(result.success).toBe(true)
    expect(result.data?.[0]?.v).toBe('active')
  })

  it('set：设置 JSON 字段路径（字符串值）', async () => {
    const { sql, params } = reldb.json.set('data', '$.status', 'inactive')
    await reldb.sql.execute(
      `UPDATE items SET data = ${sql} WHERE id = 1`,
      params,
    )
    const { sql: exSql, params: exParams } = reldb.json.extract('data', '$.status')
    const result = await reldb.sql.query<{ v: string }>(
      `SELECT ${exSql} as v FROM items WHERE id = 1`,
      exParams,
    )
    expect(result.data?.[0]?.v).toBe('inactive')
  })

  it('set：设置 JSON 字段路径（数值）', async () => {
    const { sql, params } = reldb.json.set('data', '$.count', 99)
    await reldb.sql.execute(`UPDATE items SET data = ${sql} WHERE id = 1`, params)
    const { sql: exSql, params: exParams } = reldb.json.extract('data', '$.count')
    const result = await reldb.sql.query<{ v: number }>(
      `SELECT ${exSql} as v FROM items WHERE id = 1`,
      exParams,
    )
    expect(result.data?.[0]?.v).toBe(99)
  })

  it('set：设置 JSON 字段路径（对象值）', async () => {
    const { sql, params } = reldb.json.set('data', '$.meta', { v: 2, extra: 'x' })
    await reldb.sql.execute(`UPDATE items SET data = ${sql} WHERE id = 1`, params)
    const { sql: exSql, params: exParams } = reldb.json.extract('data', '$.meta.v')
    const result = await reldb.sql.query<{ v: number }>(
      `SELECT ${exSql} as v FROM items WHERE id = 1`,
      exParams,
    )
    expect(result.data?.[0]?.v).toBe(2)
  })

  it('insert：仅当路径不存在时插入', async () => {
    // 路径不存在：应插入
    const { sql: insSql, params: insParams } = reldb.json.insert('data', '$.newField', 'created')
    await reldb.sql.execute(`UPDATE items SET data = ${insSql} WHERE id = 1`, insParams)

    const { sql: exSql, params: exParams } = reldb.json.extract('data', '$.newField')
    const after = await reldb.sql.query<{ v: string }>(
      `SELECT ${exSql} as v FROM items WHERE id = 1`,
      exParams,
    )
    expect(after.data?.[0]?.v).toBe('created')

    // 路径已存在：不应覆盖
    const { sql: insSql2, params: insParams2 } = reldb.json.insert('data', '$.newField', 'overwrite')
    await reldb.sql.execute(`UPDATE items SET data = ${insSql2} WHERE id = 1`, insParams2)

    const afterAgain = await reldb.sql.query<{ v: string }>(
      `SELECT ${exSql} as v FROM items WHERE id = 1`,
      exParams,
    )
    expect(afterAgain.data?.[0]?.v).toBe('created')
  })

  it('remove：删除 JSON 字段路径', async () => {
    const { sql, params } = reldb.json.remove('data', '$.status')
    await reldb.sql.execute(`UPDATE items SET data = ${sql} WHERE id = 1`, params)

    const { sql: exSql, params: exParams } = reldb.json.extract('data', '$.status')
    const result = await reldb.sql.query<{ v: unknown }>(
      `SELECT ${exSql} as v FROM items WHERE id = 1`,
      exParams,
    )
    expect(result.data?.[0]?.v).toBeNull()
  })

  it('merge：合并 JSON 对象（覆盖已有键）', async () => {
    const { sql, params } = reldb.json.merge('data', { status: 'merged', extra: 'added' })
    await reldb.sql.execute(`UPDATE items SET data = ${sql} WHERE id = 1`, params)

    const { sql: exSql1, params: exParams1 } = reldb.json.extract('data', '$.status')
    const { sql: exSql2, params: exParams2 } = reldb.json.extract('data', '$.extra')
    const s = await reldb.sql.query<{ v: string }>(
      `SELECT ${exSql1} as v FROM items WHERE id = 1`,
      exParams1,
    )
    const e = await reldb.sql.query<{ v: string }>(
      `SELECT ${exSql2} as v FROM items WHERE id = 1`,
      exParams2,
    )
    expect(s.data?.[0]?.v).toBe('merged')
    expect(e.data?.[0]?.v).toBe('added')
  })

  it('merge：通过 null 值删除键（RFC 7396）', async () => {
    const { sql, params } = reldb.json.merge('data', { status: null })
    await reldb.sql.execute(`UPDATE items SET data = ${sql} WHERE id = 1`, params)

    const { sql: exSql, params: exParams } = reldb.json.extract('data', '$.status')
    const result = await reldb.sql.query<{ v: unknown }>(
      `SELECT ${exSql} as v FROM items WHERE id = 1`,
      exParams,
    )
    expect(result.data?.[0]?.v).toBeNull()
  })
})

// =============================================================================
// reldb.json 未初始化时的默认行为
// =============================================================================

describe('reldb.json 未初始化时的默认行为', () => {
  beforeEach(async () => {
    await reldb.close()
  })

  it('未初始化时返回 sqlite 格式的构建器', () => {
    const { sql, params } = reldb.json.extract('data', '$.key')
    expect(sql).toBe('json_extract(data, ?)')
    expect(params).toEqual(['$.key'])
  })
})
