/** 真实 LanceDB 原子写入：缺能力、引擎执行失败、双 Node 新键冲突与 insert 保留语义。 */
import type { MergeInsertBuilder, Table } from '@lancedb/lancedb'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { HaiVecdbError, vecdb } from '../src/index'
import { createLancedbNodeFactory } from './helpers/lancedb-test-node'

const driver: typeof import('@lancedb/lancedb') = createRequire(import.meta.url)('@lancedb/lancedb')
const root = path.resolve(import.meta.dirname, '../tmp')
let directory: string
let independentNode: Awaited<ReturnType<typeof createLancedbNodeFactory>>

beforeAll(async () => {
  await mkdir(root, { recursive: true })
  directory = await mkdtemp(path.join(root, 'atomic-write-'))
  if (!directory.startsWith(`${root}${path.sep}`))
    throw new Error('Unexpected atomic-write test directory')
  independentNode = await createLancedbNodeFactory(directory)
}, 30_000)

afterEach(async () => {
  vi.restoreAllMocks()
  await vecdb.close()
})
afterAll(async () => {
  if (directory)
    await rm(directory, { recursive: true, force: true })
})

/** 建立独立真实集合，并返回原生只读连接以核对 manifest 与实际行。 */
async function collection(name: string) {
  const database = path.join(directory, name)
  expect((await vecdb.init({ type: 'lancedb', path: database })).success).toBe(true)
  expect((await vecdb.collection.create('docs', { dimension: 2 })).success).toBe(true)
  const connection = await driver.connect(database, { readConsistencyInterval: 0 })
  const table = await connection.openTable('docs')
  return {
    database,
    table,
    close() {
      table.close()
      connection.close()
    },
  }
}

describe('lancedb atomic writes', () => {
  it('初始 manifest 已包含非空主键，insert 保留已有 ID，upsert 整体替换；重复输入先拒绝', async () => {
    const fixture = await collection('semantics')
    try {
      expect(await fixture.table.version()).toBe(1)
      const id = (await fixture.table.schema()).fields.find(field => field.name === 'id')
      expect(id?.nullable).toBe(false)
      expect(id?.metadata.get('lance-schema:unenforced-primary-key')).toBe('true')
      expect(id?.metadata.get('lance-schema:unenforced-primary-key:position')).toBe('1')
      expect((await vecdb.vector.insert('docs', [{ id: 'one', vector: [1, 0], content: 'original', metadata: { version: 1 } }])).success).toBe(true)
      expect((await vecdb.vector.insert('docs', [{ id: 'one', vector: [0, 1], content: 'ignored' }])).success).toBe(true)
      expect(await fixture.table.countRows()).toBe(1)
      expect((await fixture.table.query().toArray())[0]).toMatchObject({ id: 'one', content: 'original', metadata: '{"version":1}' })
      expect((await vecdb.vector.upsert('docs', [{ id: 'one', vector: [0, 1], content: 'replacement', metadata: { version: 2 } }])).success).toBe(true)
      expect((await fixture.table.query().toArray())[0]).toMatchObject({ id: 'one', content: 'replacement', metadata: '{"version":2}' })
      for (const operation of [vecdb.vector.insert, vecdb.vector.upsert]) {
        const result = await operation('docs', [{ id: 'one', vector: [1, 0] }, { id: 'one', vector: [0, 1] }])
        expect(result).toMatchObject({ success: false, error: { code: HaiVecdbError.CONFIG_ERROR.code } })
      }
      expect(await fixture.table.countRows()).toBe(1)
      expect((await fixture.table.query().toArray())[0].content).toBe('replacement')
    }
    finally {
      fixture.close()
    }
  })

  it('真实表缺少 mergeInsert 能力时不调用 delete/add，原记录完整保留', async () => {
    const fixture = await collection('missing-merge')
    const prototype: Table = Object.getPrototypeOf(fixture.table)
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'mergeInsert')
    try {
      if (!descriptor)
        throw new Error('Missing native mergeInsert descriptor')
      expect((await vecdb.vector.upsert('docs', [{ id: 'one', vector: [1, 0], content: 'original' }])).success).toBe(true)
      const remove = vi.spyOn(prototype, 'delete')
      const append = vi.spyOn(prototype, 'add').mockRejectedValue(new Error('Injected append failure'))
      // 仅撤去真实引擎的能力入口；表、读取与可能的旧 delete/add 分支仍使用真实后端。
      Object.defineProperty(prototype, 'mergeInsert', { value: undefined })
      for (const operation of [vecdb.vector.insert, vecdb.vector.upsert])
        expect(await operation('docs', [{ id: 'one', vector: [0, 1], content: 'changed' }])).toMatchObject({ success: false, error: { code: HaiVecdbError.CONFIG_ERROR.code } })
      expect(remove).not.toHaveBeenCalled()
      expect(append).not.toHaveBeenCalled()
      expect(await fixture.table.countRows()).toBe(1)
      expect((await fixture.table.query().toArray())[0].content).toBe('original')
    }
    finally {
      if (descriptor)
        Object.defineProperty(prototype, 'mergeInsert', descriptor)
      fixture.close()
    }
  })

  it('原生执行阶段转换故障时整个 merge 不发布，旧行与 manifest 版本保持不变', async () => {
    const fixture = await collection('engine-failure')
    try {
      expect((await vecdb.vector.upsert('docs', [{ id: 'one', vector: [1, 0], content: 'original', metadata: { saved: true } }])).success).toBe(true)
      const version = await fixture.table.version()
      const execute = driver.MergeInsertBuilder.prototype.execute
      vi.spyOn(driver.MergeInsertBuilder.prototype, 'execute').mockImplementationOnce(function (this: MergeInsertBuilder, data, options) {
        // Arrow 输入有效；让真实引擎处理匹配行时对文本执行非法类型转换，触发执行错误。
        return execute.call(this.whenMatchedUpdateAll({ where: 'CAST(source.content AS INTEGER) > 0' }), data, options)
      })
      const result = await vecdb.vector.upsert('docs', [
        { id: 'one', vector: [0, 1], content: 'not-an-integer' },
        { id: 'new', vector: [0, 1], content: 'new-row' },
      ])
      expect(result).toMatchObject({ success: false, error: { code: HaiVecdbError.UPDATE_FAILED.code } })
      if (!result.success)
        expect(String(result.error.cause)).toContain('not-an-integer')
      expect(await fixture.table.version()).toBe(version)
      const rows = await fixture.table.query().toArray()
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ id: 'one', content: 'original', metadata: '{"saved":true}' })
      expect(Array.from(rows[0].vector)).toEqual([1, 0])
    }
    finally {
      fixture.close()
    }
  })

  it('缺少持久主键的旧表拒绝所有新增写入，不尝试自动迁移或清空', async () => {
    const database = path.join(directory, 'legacy')
    const connection = await driver.connect(database, { readConsistencyInterval: 0 })
    const data = driver.makeArrowTable([{ id: 'one', vector: [1, 0], content: 'original', metadata: '{}' }], {}, new Map([['hai.vecdb.metric', 'cosine']]))
    const table = await connection.createTable('docs', data)
    try {
      expect((await vecdb.init({ type: 'lancedb', path: database })).success).toBe(true)
      for (const operation of [vecdb.vector.insert, vecdb.vector.upsert])
        expect(await operation('docs', [{ id: 'one', vector: [0, 1], content: 'changed' }])).toMatchObject({ success: false, error: { code: HaiVecdbError.CONFIG_ERROR.code } })
      expect(await table.countRows()).toBe(1)
      expect((await table.query().toArray())[0].content).toBe('original')
    }
    finally {
      table.close()
      connection.close()
    }
  })

  it.each([undefined, 'false'])('非空 id 只有 position、flag=%s 时拒绝写入且不改变原行或版本', async (flag) => {
    const database = path.join(directory, `position-only-${flag ?? 'missing'}`)
    const connection = await driver.connect(database, { readConsistencyInterval: 0 })
    const inferred = driver.makeArrowTable([{ id: 'one', vector: [1, 0], content: 'original', metadata: '{}' }], {}, new Map([['hai.vecdb.metric', 'cosine']])).schema
    const metadata = new Map([['lance-schema:unenforced-primary-key:position', '1']])
    if (flag !== undefined)
      metadata.set('lance-schema:unenforced-primary-key', flag)
    const schema = inferred.assign(inferred.fields.map(field => field.name === 'id' ? field.clone({ nullable: false, metadata }) : field))
    const table = await connection.createEmptyTable('docs', schema)
    try {
      // 使用原生 add 构造不满足框架写契约的真实外部表，生产路径不可用它绕过检查。
      await table.add([{ id: 'one', vector: [1, 0], content: 'original', metadata: '{"saved":true}' }])
      const id = (await table.schema()).fields.find(field => field.name === 'id')
      expect(id?.nullable).toBe(false)
      expect(id?.metadata.get('lance-schema:unenforced-primary-key')).toBe(flag)
      expect(id?.metadata.get('lance-schema:unenforced-primary-key:position')).toBe('1')
      const version = await table.version()
      expect((await vecdb.init({ type: 'lancedb', path: database })).success).toBe(true)
      for (const operation of [vecdb.vector.insert, vecdb.vector.upsert])
        expect(await operation('docs', [{ id: 'one', vector: [0, 1], content: 'changed' }])).toMatchObject({ success: false, error: { code: HaiVecdbError.CONFIG_ERROR.code } })
      expect(await table.version()).toBe(version)
      const rows = await table.query().toArray()
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ id: 'one', content: 'original', metadata: '{"saved":true}' })
      expect(Array.from(rows[0].vector)).toEqual([1, 0])
    }
    finally {
      table.close()
      connection.close()
    }
  })

  it('两个真实 Node 并发新 ID 不重复，insert/upsert 竞争与后续有序更新得到完整最终记录', async () => {
    const fixture = await collection('nodes')
    const nodes = await Promise.all([independentNode(fixture.database), independentNode(fixture.database)])
    try {
      expect(nodes[0].pid).not.toBe(nodes[1].pid)
      for (let round = 0; round < 4; round++) {
        const id = `new-${round}`
        const results = await Promise.all(nodes.map((node, index) => node.invoke(round === 1 && index === 0 ? 'insert' : 'upsert', {
          name: 'docs',
          documents: [{ id, vector: [index + 1, 1], content: `node-${index}`, metadata: { node: index, round } }],
        })))
        expect(results).toEqual([{ success: true }, { success: true }])
        expect(await fixture.table.countRows()).toBe(round + 1)
        const rows = (await fixture.table.query().toArray()).filter(row => row.id === id)
        expect(rows).toHaveLength(1)
        const winner = JSON.parse(rows[0].metadata).node as number
        expect(rows[0].content).toBe(`node-${winner}`)
        expect(Array.from(rows[0].vector)).toEqual([winner + 1, 1])
        if (round === 1)
          expect(winner).toBe(1)
      }
      expect(await nodes[0].invoke('upsert', { name: 'docs', documents: [{ id: 'new-0', vector: [1, 0], content: 'ordered-final', metadata: { final: true } }] })).toEqual({ success: true })
      expect(await nodes[1].invoke('snapshot', { name: 'docs', vector: [1, 0] })).toMatchObject({
        info: { success: true, data: { count: 4 } },
        search: { success: true, data: expect.arrayContaining([expect.objectContaining({ id: 'new-0', content: 'ordered-final', metadata: { final: true } })]) },
      })
    }
    finally {
      await Promise.all(nodes.map(node => node.close()))
      fixture.close()
    }
  }, 30_000)
})
