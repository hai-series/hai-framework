/**
 * =============================================================================
 * @h-ai/reldb - BaseReldbCrudRepository 类型转换测试
 * =============================================================================
 *
 * 覆盖 BaseReldbCrudRepository 的值类型转换场景：
 * - BOOLEAN 类型的读写与映射（true/false ↔ 1/0）
 * - JSON 类型的读写（对象/数组 ↔ 字符串）
 * - TIMESTAMP 类型的读写（Date ↔ number/Date）
 * - NULL/undefined 处理（可选字段）
 * - createdAt / updatedAt 自动填充
 * - 自定义 nowProvider
 * - createMany ID 自动生成
 * - buildUpdatePayload updatedAt 自动刷新
 * =============================================================================
 */

import type { ReldbCrudFieldDefinition } from '../src/index.js'
import { describe, expect, it } from 'vitest'
import { BaseReldbCrudRepository, reldb } from '../src/index.js'
import { defineDbSuite, mysqlEnv, postgresEnv, sqliteMemoryEnv } from './helpers/reldb-test-suite.js'

// =============================================================================
// 测试用 Repository
// =============================================================================

interface ArticleRow {
  id: number
  title: string
  content: string | undefined
  published: boolean
  tags: string[] | undefined
  metadata: Record<string, unknown> | undefined
  publishedAt: Date | undefined
  createdAt: Date
  updatedAt: Date
}

const ARTICLE_FIELDS: ReldbCrudFieldDefinition[] = [
  {
    fieldName: 'id',
    columnName: 'id',
    def: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
    select: true,
    create: false,
    update: false,
  },
  {
    fieldName: 'title',
    columnName: 'title',
    def: { type: 'TEXT', notNull: true },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'content',
    columnName: 'content',
    def: { type: 'TEXT' },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'published',
    columnName: 'published',
    def: { type: 'BOOLEAN', notNull: true, defaultValue: false },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'tags',
    columnName: 'tags',
    def: { type: 'JSON' },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'metadata',
    columnName: 'metadata',
    def: { type: 'JSON' },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'publishedAt',
    columnName: 'published_at',
    def: { type: 'TIMESTAMP' },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'createdAt',
    columnName: 'created_at',
    def: { type: 'TIMESTAMP', notNull: true },
    select: true,
    create: true,
    update: false,
  },
  {
    fieldName: 'updatedAt',
    columnName: 'updated_at',
    def: { type: 'TIMESTAMP', notNull: true },
    select: true,
    create: true,
    update: false,
  },
]

class ArticleRepository extends BaseReldbCrudRepository<ArticleRow> {
  constructor() {
    super(reldb, {
      table: 'articles',
      idColumn: 'id',
      fields: ARTICLE_FIELDS,
    })
  }
}

// ─── 自定义 nowProvider 的仓库 ───

interface NoteRow {
  id: string
  text: string
  createdAt: Date
  updatedAt: Date
}

const NOTE_FIELDS: ReldbCrudFieldDefinition[] = [
  {
    fieldName: 'id',
    columnName: 'id',
    def: { type: 'TEXT', primaryKey: true },
    select: true,
    create: true,
    update: false,
  },
  {
    fieldName: 'text',
    columnName: 'text',
    def: { type: 'TEXT', notNull: true },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'createdAt',
    columnName: 'created_at',
    def: { type: 'TIMESTAMP', notNull: true },
    select: true,
    create: true,
    update: false,
  },
  {
    fieldName: 'updatedAt',
    columnName: 'updated_at',
    def: { type: 'TIMESTAMP', notNull: true },
    select: true,
    create: true,
    update: false,
  },
]

class NoteRepository extends BaseReldbCrudRepository<NoteRow> {
  private counter = 0

  constructor(private readonly fixedTime: number) {
    super(reldb, {
      table: 'notes',
      idColumn: 'id',
      idField: 'id',
      fields: NOTE_FIELDS,
      generateId: () => {
        this.counter += 1
        return `note-${this.counter}`
      },
      nowProvider: () => fixedTime,
    })
  }
}

// =============================================================================
// 测试
// =============================================================================

describe('db.BaseReldbCrudRepository types', () => {
  const defineCommon = (label: 'sqlite' | 'mysql' | 'postgresql') => {
    // ─── BOOLEAN 类型 ───

    it(`${label}: BOOLEAN 字段写入 true 读回应为 true`, async () => {
      await reldb.ddl.dropTable('articles', true)
      const repo = new ArticleRepository()

      await repo.create({ title: '已发布文章', published: true })

      const result = await repo.findById(1)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data?.published).toBe(true)
      }
    })

    it(`${label}: BOOLEAN 字段写入 false 读回应为 false`, async () => {
      await reldb.ddl.dropTable('articles', true)
      const repo = new ArticleRepository()

      await repo.create({ title: '草稿', published: false })

      const result = await repo.findById(1)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data?.published).toBe(false)
      }
    })

    it(`${label}: BOOLEAN 字段更新 false 为 true 应生效`, async () => {
      await reldb.ddl.dropTable('articles', true)
      const repo = new ArticleRepository()

      await repo.create({ title: '草稿', published: false })

      await repo.updateById(1, { published: true })

      const result = await repo.findById(1)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data?.published).toBe(true)
      }
    })

    // ─── JSON 类型 ───

    it(`${label}: JSON 字段写入对象读回应保持结构`, async () => {
      await reldb.ddl.dropTable('articles', true)
      const repo = new ArticleRepository()

      const metadata = { author: 'Alice', priority: 1, nested: { key: 'value' } }
      await repo.create({ title: '有元数据的文章', metadata })

      const result = await repo.findById(1)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data?.metadata).toEqual(metadata)
      }
    })

    it(`${label}: JSON 字段写入数组读回应保持结构`, async () => {
      await reldb.ddl.dropTable('articles', true)
      const repo = new ArticleRepository()

      const tags = ['typescript', 'database', 'testing']
      await repo.create({ title: '带标签的文章', tags })

      const result = await repo.findById(1)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data?.tags).toEqual(tags)
      }
    })

    it(`${label}: JSON 字段更新应生效`, async () => {
      await reldb.ddl.dropTable('articles', true)
      const repo = new ArticleRepository()

      await repo.create({ title: '文章', metadata: { v: 1 } })

      await repo.updateById(1, { metadata: { v: 2, extra: 'field' } })

      const result = await repo.findById(1)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data?.metadata).toEqual({ v: 2, extra: 'field' })
      }
    })

    // ─── TIMESTAMP 类型 ───

    it(`${label}: TIMESTAMP 字段写入 Date 读回应为 Date`, async () => {
      await reldb.ddl.dropTable('articles', true)
      const repo = new ArticleRepository()

      const publishedAt = new Date('2025-06-15T10:30:00Z')
      await repo.create({ title: '有发布时间的文章', publishedAt })

      const result = await repo.findById(1)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data?.publishedAt).toBeInstanceOf(Date)
        expect(result.data?.publishedAt?.getTime()).toBe(publishedAt.getTime())
      }
    })

    it(`${label}: TIMESTAMP 字段写入数值时间戳读回应为 Date`, async () => {
      await reldb.ddl.dropTable('articles', true)
      const repo = new ArticleRepository()

      // MySQL DATETIME 精度为秒级，对齐到秒避免毫秒截断
      const timestamp = Math.floor(Date.now() / 1000) * 1000
      await repo.create({ title: '数值时间戳', publishedAt: timestamp })

      const result = await repo.findById(1)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data?.publishedAt).toBeInstanceOf(Date)
        expect(result.data?.publishedAt?.getTime()).toBe(timestamp)
      }
    })

    // ─── NULL/undefined 处理 ───

    it(`${label}: 可选字段不赋值读回应为 undefined`, async () => {
      await reldb.ddl.dropTable('articles', true)
      const repo = new ArticleRepository()

      // 不设置 content、tags、metadata、publishedAt
      await repo.create({ title: '仅标题' })

      const result = await repo.findById(1)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data?.title).toBe('仅标题')
        expect(result.data?.content).toBeUndefined()
        expect(result.data?.tags).toBeUndefined()
        expect(result.data?.metadata).toBeUndefined()
        expect(result.data?.publishedAt).toBeUndefined()
      }
    })

    // ─── createdAt / updatedAt 自动填充 ───

    it(`${label}: createdAt 和 updatedAt 应自动填充`, async () => {
      await reldb.ddl.dropTable('articles', true)
      const repo = new ArticleRepository()

      // MySQL DATETIME 精度为秒级，向下取整留出 1s 容差
      const before = Math.floor(Date.now() / 1000) * 1000 - 1000
      await repo.create({ title: '自动时间' })
      const after = Date.now() + 1000

      const result = await repo.findById(1)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data?.createdAt).toBeInstanceOf(Date)
        expect(result.data?.updatedAt).toBeInstanceOf(Date)
        // 创建时间应在合理范围内（容差 ±1s 以适配 MySQL 秒级精度）
        const createdMs = result.data!.createdAt.getTime()
        expect(createdMs).toBeGreaterThanOrEqual(before)
        expect(createdMs).toBeLessThanOrEqual(after)
      }
    })

    it(`${label}: updateById 应刷新 updatedAt`, async () => {
      await reldb.ddl.dropTable('articles', true)
      const repo = new ArticleRepository()

      await repo.create({ title: '原始标题' })

      const before = await repo.findById(1)
      expect(before.success).toBe(true)

      await new Promise(resolve => setTimeout(resolve, 10))

      await repo.updateById(1, { title: '更新标题' })

      const after = await repo.findById(1)
      expect(after.success).toBe(true)
      if (before.success && after.success && before.data && after.data) {
        expect(after.data.title).toBe('更新标题')
        expect(after.data.updatedAt.getTime()).toBeGreaterThanOrEqual(before.data.updatedAt.getTime())
      }
    })

    // ─── 自定义 nowProvider + generateId ───

    it(`${label}: 自定义 nowProvider 应使用固定时间`, async () => {
      await reldb.ddl.dropTable('notes', true)
      const fixedTime = new Date('2025-01-01T00:00:00Z').getTime()
      const repo = new NoteRepository(fixedTime)

      await repo.create({ text: '笔记1' })

      const result = await repo.findById('note-1')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data?.id).toBe('note-1')
        expect(result.data?.text).toBe('笔记1')
        expect(result.data?.createdAt.getTime()).toBe(fixedTime)
        expect(result.data?.updatedAt.getTime()).toBe(fixedTime)
      }
    })

    it(`${label}: 自定义 generateId 在 createMany 时应每条生成不同 ID`, async () => {
      await reldb.ddl.dropTable('notes', true)
      const fixedTime = Date.now()
      const repo = new NoteRepository(fixedTime)

      await repo.createMany([
        { text: '笔记A' },
        { text: '笔记B' },
        { text: '笔记C' },
      ])

      const all = await repo.findAll({ orderBy: 'id ASC' })
      expect(all.success).toBe(true)
      if (all.success) {
        expect(all.data).toHaveLength(3)
        const ids = all.data.map(n => n.id)
        expect(ids).toEqual(['note-1', 'note-2', 'note-3'])
      }
    })

    // ─── 直接提供主键 ───

    it(`${label}: 直接提供主键值时不应调用 generateId`, async () => {
      await reldb.ddl.dropTable('notes', true)
      const fixedTime = Date.now()
      const repo = new NoteRepository(fixedTime)

      await repo.create({ id: 'custom-id', text: '自定义ID笔记' })

      const result = await repo.findById('custom-id')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data?.id).toBe('custom-id')
        expect(result.data?.text).toBe('自定义ID笔记')
      }
    })

    // ─── 完整生命周期 ───

    it(`${label}: 完整 CRUD 生命周期（创建→查询→更新→删除）`, async () => {
      await reldb.ddl.dropTable('articles', true)
      const repo = new ArticleRepository()

      // 创建
      const createResult = await repo.create({
        title: '完整测试',
        content: '内容',
        published: false,
        tags: ['test'],
        metadata: { version: 1 },
      })
      expect(createResult.success).toBe(true)

      // 查询
      const findResult = await repo.findById(1)
      expect(findResult.success).toBe(true)
      if (findResult.success) {
        expect(findResult.data?.title).toBe('完整测试')
        expect(findResult.data?.content).toBe('内容')
        expect(findResult.data?.published).toBe(false)
        expect(findResult.data?.tags).toEqual(['test'])
        expect(findResult.data?.metadata).toEqual({ version: 1 })
      }

      // 更新
      const updateResult = await repo.updateById(1, {
        title: '完整测试-更新',
        published: true,
        tags: ['test', 'updated'],
        metadata: { version: 2, reviewed: true },
      })
      expect(updateResult.success).toBe(true)

      // 查询更新后的数据
      const afterUpdate = await repo.findById(1)
      expect(afterUpdate.success).toBe(true)
      if (afterUpdate.success) {
        expect(afterUpdate.data?.title).toBe('完整测试-更新')
        expect(afterUpdate.data?.published).toBe(true)
        expect(afterUpdate.data?.tags).toEqual(['test', 'updated'])
        expect(afterUpdate.data?.metadata).toEqual({ version: 2, reviewed: true })
      }

      // 验证存在
      const existsResult = await repo.existsById(1)
      expect(existsResult.success).toBe(true)
      if (existsResult.success) {
        expect(existsResult.data).toBe(true)
      }

      // 删除
      const deleteResult = await repo.deleteById(1)
      expect(deleteResult.success).toBe(true)
      if (deleteResult.success) {
        expect(deleteResult.data.changes).toBe(1)
      }

      // 验证不存在
      const afterDelete = await repo.findById(1)
      expect(afterDelete.success).toBe(true)
      if (afterDelete.success) {
        expect(afterDelete.data).toBeNull()
      }
    })

    // ─── 事务中使用 BaseReldbCrudRepository ───

    it(`${label}: BaseReldbCrudRepository 在事务中 create 后 rollback 应撤回`, async () => {
      await reldb.ddl.dropTable('articles', true)
      const repo = new ArticleRepository()

      const txResult = await reldb.tx.begin()
      expect(txResult.success).toBe(true)
      if (!txResult.success)
        return

      const tx = txResult.data
      await repo.create({ title: '事务文章1' }, tx)
      await repo.create({ title: '事务文章2' }, tx)

      // 事务内应有 2 条
      const inTx = await repo.count(undefined, tx)
      expect(inTx.success).toBe(true)
      if (inTx.success) {
        expect(inTx.data).toBe(2)
      }

      await tx.rollback()

      // 回滚后应为 0
      const afterRollback = await repo.count()
      expect(afterRollback.success).toBe(true)
      if (afterRollback.success) {
        expect(afterRollback.data).toBe(0)
      }
    })

    // ─── createTableIfNotExists: false ───

    it(`${label}: createTableIfNotExists=false 时不应自动建表`, async () => {
      await reldb.ddl.dropTable('manual_table', true)

      class ManualRepo extends BaseReldbCrudRepository<{ id: number, val: string }> {
        constructor() {
          super(reldb, {
            table: 'manual_table',
            idColumn: 'id',
            fields: [
              { fieldName: 'id', columnName: 'id', def: { type: 'INTEGER', primaryKey: true, autoIncrement: true }, select: true, create: false, update: false },
              { fieldName: 'val', columnName: 'val', def: { type: 'TEXT', notNull: true }, select: true, create: true, update: true },
            ],
            createTableIfNotExists: false,
          })
        }
      }

      const repo = new ManualRepo()

      // 表不存在，查询应失败
      const result = await repo.findAll()
      expect(result.success).toBe(false)
    })
  }

  defineDbSuite('sqlite', sqliteMemoryEnv, () => defineCommon('sqlite'))

  defineDbSuite('mysql', mysqlEnv, () => defineCommon('mysql'))

  defineDbSuite('postgresql', postgresEnv, () => defineCommon('postgresql'))
})
