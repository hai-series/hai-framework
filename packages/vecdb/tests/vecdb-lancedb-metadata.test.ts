/** 使用真实原生驱动验证持久集合定义、独立进程及外部重建后的读取。 */
import type { VectorDocument } from '../src/index'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { HaiVecdbError, vecdb } from '../src/index'
import { createLancedbNodeFactory } from './helpers/lancedb-test-node'

const require = createRequire(import.meta.url)
const temporaryRoot = path.resolve(import.meta.dirname, '../tmp')
let directory: string
let independentNode: Awaited<ReturnType<typeof createLancedbNodeFactory>>

const cases = [
  { name: 'cosine', dimension: 2, metric: 'cosine', order: ['aligned', 'near', 'large'] },
  { name: 'l2', dimension: 3, metric: 'euclidean', order: ['near', 'aligned', 'large'] },
  { name: 'dot', dimension: 4, metric: 'dot', order: ['large', 'aligned', 'near'] },
] as const

/** 补齐不同维度，保持前三组向量在各 metric 下有可区分的排序。 */
function documents(dimension: number): VectorDocument[] {
  return [
    { id: 'aligned', vector: [2, 0] },
    { id: 'near', vector: [0.9, 0.1] },
    { id: 'large', vector: [3, 3] },
  ].map(doc => ({ ...doc, vector: [...doc.vector, ...Array.from({ length: dimension - 2 }).fill(0) as number[]], content: doc.id, metadata: { source: 'wiki', nested: { page: 1 } } }))
}

beforeAll(async () => {
  await mkdir(temporaryRoot, { recursive: true })
  directory = await mkdtemp(path.join(temporaryRoot, 'lance-metadata-'))
  if (!directory.startsWith(`${temporaryRoot}${path.sep}`))
    throw new Error('Unexpected LanceDB test directory')
  independentNode = await createLancedbNodeFactory(directory)
}, 30_000)

afterEach(async () => {
  await vecdb.close()
})
afterAll(async () => {
  if (directory)
    await rm(directory, { recursive: true, force: true })
})

describe('lancedb persisted schema', () => {
  it('空表和非空表的维度、metric、元数据与排序在重启后保持一致', async () => {
    const database = path.join(directory, 'restart')
    expect((await vecdb.init({ type: 'lancedb', path: database, metric: 'euclidean' })).success).toBe(true)
    expect((await vecdb.collection.create('default_metric', { dimension: 2 })).success).toBe(true)
    for (const item of cases) {
      expect((await vecdb.collection.create(item.name, item)).success).toBe(true)
      expect((await vecdb.collection.create(`${item.name}_empty`, { ...item, dimension: item.dimension + 4 })).success).toBe(true)
      expect((await vecdb.vector.insert(item.name, documents(item.dimension))).success).toBe(true)
    }
    await vecdb.close()
    expect((await vecdb.init({ type: 'lancedb', path: database, metric: 'dot' })).success).toBe(true)
    expect(await vecdb.collection.info('default_metric')).toMatchObject({ success: true, data: { dimension: 2, metric: 'euclidean', count: 0 } })
    for (const item of cases) {
      expect(await vecdb.collection.info(item.name)).toEqual({ success: true, data: { name: item.name, dimension: item.dimension, metric: item.metric, count: 3 } })
      expect(await vecdb.collection.info(`${item.name}_empty`)).toEqual({ success: true, data: { name: `${item.name}_empty`, dimension: item.dimension + 4, metric: item.metric, count: 0 } })
      const query = [1, ...Array.from({ length: item.dimension - 1 }).fill(0) as number[]]
      const searched = await vecdb.vector.search(item.name, query, { topK: 3 })
      expect(searched.success).toBe(true)
      if (searched.success) {
        expect(searched.data.map(doc => doc.id)).toEqual(item.order)
        expect(searched.data.map(doc => doc.score)).toEqual([...searched.data.map(doc => doc.score)].sort((a, b) => b - a))
        expect(searched.data.every(doc => doc.score >= 0 && doc.score <= 1)).toBe(true)
        expect(searched.data[0].metadata).toEqual({ source: 'wiki', nested: { page: 1 } })
        expect(searched.data[0].score).toBeCloseTo(item.metric === 'dot' ? 1 / (1 + Math.exp(-3)) : item.metric === 'cosine' ? 1 : 1 / 1.02, 5)
      }
      const threshold = await vecdb.vector.search(item.name, query, { topK: 3, minScore: item.metric === 'cosine' ? 0.99 : 0.9 })
      expect(threshold.success).toBe(true)
      if (threshold.success)
        expect(threshold.data.map(doc => doc.id)).toEqual(item.metric === 'cosine' ? ['aligned', 'near'] : item.metric === 'dot' ? ['large'] : ['near'])
      expect(await vecdb.vector.search(item.name, [1])).toMatchObject({ success: false, error: { code: HaiVecdbError.DIMENSION_MISMATCH.code } })
      expect(await vecdb.vector.insert(`${item.name}_empty`, [{ id: 'bad', vector: [1] }])).toMatchObject({ success: false, error: { code: HaiVecdbError.DIMENSION_MISMATCH.code } })
      expect(await vecdb.vector.upsert(item.name, [{ id: 'bad', vector: [1] }])).toMatchObject({ success: false, error: { code: HaiVecdbError.DIMENSION_MISMATCH.code } })
    }
  }, 30_000)

  it('已连接的独立进程读取新建/重建的 schema，重启新进程仍使用集合定义', async () => {
    const database = path.join(directory, 'nodes')
    expect((await vecdb.init({ type: 'lancedb', path: database })).success).toBe(true)
    let node = await independentNode(database)
    try {
      expect(node.pid).not.toBe(process.pid)
      expect((await vecdb.collection.create('shared', { dimension: 2, metric: 'cosine' })).success).toBe(true)
      expect((await vecdb.vector.insert('shared', documents(2))).success).toBe(true)
      expect(await node.invoke('snapshot', { name: 'shared', vector: [1, 0] })).toMatchObject({
        info: { success: true, data: { dimension: 2, metric: 'cosine', count: 3 } },
        search: { success: true, data: [{ id: 'aligned' }, { id: 'near' }, { id: 'large' }] },
      })
      expect((await vecdb.collection.drop('shared')).success).toBe(true)
      expect((await vecdb.collection.create('shared', { dimension: 3, metric: 'euclidean' })).success).toBe(true)
      expect(await node.invoke('snapshot', { name: 'shared', vector: [1, 0] })).toMatchObject({
        info: { success: true, data: { dimension: 3, metric: 'euclidean', count: 0 } },
        search: { success: false, error: { code: HaiVecdbError.DIMENSION_MISMATCH.code } },
      })
      expect(await node.invoke('insert', { name: 'shared', documents: documents(3) })).toEqual({ success: true })
      expect(await vecdb.vector.count('shared')).toEqual({ success: true, data: 3 })
      const firstPid = node.pid
      await node.close()
      node = await independentNode(database)
      expect(node.pid).not.toBe(firstPid)
      expect(await node.invoke('snapshot', { name: 'shared', vector: [1, 0, 0] })).toMatchObject({
        info: { success: true, data: { dimension: 3, metric: 'euclidean', count: 3 } },
        search: { success: true, data: [{ id: 'near' }, { id: 'aligned' }, { id: 'large' }] },
      })
    }
    finally {
      await node.close()
    }
  }, 30_000)

  it('缺少持久 metric 的外部表明确失败，不回退到连接配置', async () => {
    const database = path.join(directory, 'invalid')
    const driver: typeof import('@lancedb/lancedb') = require('@lancedb/lancedb')
    const connection = await driver.connect(database)
    try {
      const table = await connection.createTable('external', documents(2).map(doc => ({ ...doc, metadata: JSON.stringify(doc.metadata) })))
      table.close()
    }
    finally {
      connection.close()
    }
    expect((await vecdb.init({ type: 'lancedb', path: database, metric: 'dot' })).success).toBe(true)
    expect(await vecdb.collection.info('external')).toMatchObject({ success: false, error: { code: HaiVecdbError.CONFIG_ERROR.code } })
    expect(await vecdb.vector.search('external', [1, 0])).toMatchObject({ success: false, error: { code: HaiVecdbError.CONFIG_ERROR.code } })
    expect(await vecdb.vector.insert('external', [{ id: 'next', vector: [1, 0] }])).toMatchObject({ success: false, error: { code: HaiVecdbError.CONFIG_ERROR.code } })
  })
})
