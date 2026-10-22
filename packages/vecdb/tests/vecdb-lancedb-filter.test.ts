/** 真实 LanceDB JSON 过滤：字面量隔离、原生类型、结构边界与 prefilter 召回。 */
import type { VectorDocument } from '../src/index'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { HaiVecdbError, vecdb } from '../src/index'

const driver: typeof import('@lancedb/lancedb') = createRequire(import.meta.url)('@lancedb/lancedb')
const root = path.resolve(import.meta.dirname, '../tmp')
let directory: string
let sequence = 0

beforeAll(async () => {
  await mkdir(root, { recursive: true })
  directory = await mkdtemp(path.join(root, 'json-filter-'))
  if (!directory.startsWith(`${root}${path.sep}`))
    throw new Error('Unexpected filter test directory')
})
afterEach(async () => {
  await vecdb.close()
})
afterAll(async () => {
  if (directory)
    await rm(directory, { recursive: true, force: true })
})

/** 每个场景使用独立真实数据库，避免数据与连接状态相互影响。 */
async function seed(documents: VectorDocument[]) {
  const database = path.join(directory, String(sequence++))
  expect((await vecdb.init({ type: 'lancedb', path: database })).success).toBe(true)
  expect((await vecdb.collection.create('docs', { dimension: 2, metric: 'euclidean' })).success).toBe(true)
  expect((await vecdb.vector.insert('docs', documents)).success).toBe(true)
  return database
}

/** 通过公共 API 验证搜索成功，并返回可比较的文档 ID。 */
async function matching(filter: Record<string, unknown>, topK = 20) {
  const result = await vecdb.vector.search('docs', [1, 0], { filter, topK })
  expect(result.success, result.success ? undefined : String(result.error.cause)).toBe(true)
  return result.success ? result.data.map(row => row.id).sort() : []
}

describe('lancedb metadata filter', () => {
  it('值和键中的引号、反斜线、通配符、JSONPath 与 SQL 片段只能按字面量匹配', async () => {
    const values = ['alice\' OR TRUE --', 'quote"slash\\%_', '\'); DROP TABLE docs; --', '普通\n文本', '', 'a.b[0]']
    const keys = ['key\' OR TRUE --', 'quote"slash\\%_', 'a.b[0]', '', '$.*']
    await seed([
      ...values.map((value, index) => ({ id: `value-${index}`, vector: [1, 0], metadata: { owner: value } })),
      ...keys.map((key, index) => ({ id: `key-${index}`, vector: [1, 0], metadata: { [key]: values[1] } })),
      { id: 'bob', vector: [1, 0], metadata: { owner: 'bob', nested: { owner: values[0] }, a: { b: [values[1]] } } },
    ])
    for (const [index, value] of values.entries())
      expect(await matching({ owner: value })).toEqual([`value-${index}`])
    for (const [index, key] of keys.entries())
      expect(await matching({ [key]: values[1] })).toEqual([`key-${index}`])
    expect(await matching({ owner: 'missing\' OR TRUE --' })).toEqual([])
    expect(await vecdb.vector.count('docs')).toEqual({ success: true, data: values.length + keys.length + 1 })
  })

  it('数字、字符串、布尔与 null 精确区分，缺失字段和嵌套同名字段不匹配', async () => {
    const values = [1, '1', true, 'true', false, 'false', null, 'null', 1e20, 1e-7, -2.5, 0, 1e308]
    await seed([
      ...values.map((value, index) => ({ id: `typed-${index}`, vector: [1, 0], metadata: { value } })),
      { id: 'missing', vector: [1, 0], metadata: { nested: { value: null } } },
      { id: 'array', vector: [1, 0], metadata: { value: [1] } },
      { id: 'object', vector: [1, 0], metadata: { value: { value: 1 } } },
    ])
    for (const [index, value] of values.entries())
      expect(await matching({ value })).toEqual([`typed-${index}`])
    expect(await matching({ absent: null })).toEqual([])
    expect(await matching({ value: -0 })).toEqual(['typed-11'])
  })

  it('过滤在 topK 之前执行，多字段 AND 与 minScore 不漏掉允许的最近邻', async () => {
    await seed([
      { id: 'other-nearest', vector: [1, 0], metadata: { tenant: 'other', active: true } },
      { id: 'allowed-near', vector: [0.9, 0], metadata: { tenant: 'mine', active: true } },
      { id: 'inactive', vector: [0.95, 0], metadata: { tenant: 'mine', active: false } },
      { id: 'allowed-far', vector: [-1, 0], metadata: { tenant: 'mine', active: true } },
    ])
    expect(await matching({ tenant: 'mine', active: true }, 1)).toEqual(['allowed-near'])
    const result = await vecdb.vector.search('docs', [1, 0], { filter: { tenant: 'mine', active: true }, topK: 2, minScore: 0.5 })
    expect(result).toMatchObject({ success: true, data: [{ id: 'allowed-near' }] })
    expect((await matching({})).length).toBe(4)
  })

  it('不支持的 filter 结构和非有限数明确失败，不能执行无过滤查询', async () => {
    await seed([{ id: 'secret', vector: [1, 0], metadata: { owner: 'alice' } }])
    for (const value of [{ owner: 'alice' }, ['alice'], undefined, Number.NaN, Number.POSITIVE_INFINITY, 1n, new Date()]) {
      const result = await vecdb.vector.search('docs', [1, 0], { filter: { owner: value } })
      expect(result).toMatchObject({ success: false, error: { code: HaiVecdbError.CONFIG_ERROR.code } })
    }
  })

  it('原生 JSON 字段经 insert/upsert、重启后保留完整对象，替换后的类型和过滤值立即生效', async () => {
    const database = await seed([{ id: 'one', vector: [1, 0], metadata: { before: true, owner: 'old', nested: { items: [null, 'x', 2] } } }])
    const metadata = { owner: 'new\'\\%_', count: 2, active: false, empty: null, nested: { items: [1, { ok: true }] } }
    expect((await vecdb.vector.upsert('docs', [{ id: 'one', vector: [0.9, 0], metadata }])).success).toBe(true)
    await vecdb.close()
    expect((await vecdb.init({ type: 'lancedb', path: database })).success).toBe(true)
    expect(await matching({ owner: metadata.owner, count: 2, active: false, empty: null })).toEqual(['one'])
    expect(await matching({ before: true })).toEqual([])
    expect(await vecdb.vector.search('docs', [1, 0])).toMatchObject({ success: true, data: [{ id: 'one', metadata }] })
    const connection = await driver.connect(database)
    const table = await connection.openTable('docs')
    try {
      expect((await table.schema()).fields.find(field => field.name === 'metadata')?.metadata.get('ARROW:extension:name')).toBe('lance.json')
    }
    finally {
      table.close()
      connection.close()
    }
  })

  it('旧 Utf8 metadata 表明确拒绝过滤，不猜测 JSON 内容或返回未过滤数据', async () => {
    const database = path.join(directory, 'legacy')
    const connection = await driver.connect(database)
    const table = await connection.createTable('docs', driver.makeArrowTable([{ id: 'secret', vector: [1, 0], content: '', metadata: '{"owner":"alice"}' }], {}, new Map([['hai.vecdb.metric', 'cosine']])))
    try {
      expect((await vecdb.init({ type: 'lancedb', path: database })).success).toBe(true)
      expect(await vecdb.vector.search('docs', [1, 0], { filter: { owner: 'alice' } })).toMatchObject({ success: false, error: { code: HaiVecdbError.CONFIG_ERROR.code } })
      expect(await table.countRows()).toBe(1)
    }
    finally {
      table.close()
      connection.close()
    }
  })
})
