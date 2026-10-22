/** 实际 SQLite + Qdrant：版本发布、跨实例竞争与失败补偿，不使用另一套测试发布协议。 */
import type { QdrantContainerLease } from '../../vecdb/tests/helpers/qdrant-container.js'
import type { KnowledgeDocumentRevision, KnowledgeStore } from '../src/store/ai-store-types.js'
import type { KnowledgeDocumentManifest } from '../src/store/providers/ai-store-knowledge-db.js'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { err } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { HaiVecdbError, vecdb } from '@h-ai/vecdb'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { acquireQdrantContainer } from '../../vecdb/tests/helpers/qdrant-container.js'
import { createDbStoreProviderFromModules } from '../src/store/providers/ai-store-provider-db.js'

function revision(collection: string, count: number, label: string): KnowledgeDocumentRevision {
  const id = randomUUID()
  return {
    collection,
    documentId: 'guide',
    revision: id,
    title: label,
    createdAt: Date.now(),
    chunks: Array.from({ length: count }, (_, index) => ({
      id: `${id}:chunk-${index}`,
      vector: [1, 0],
      content: `${label}-${index}`,
      metadata: { documentId: 'guide', revision: id, label },
    })),
    entities: [{ id: `${id}:entity`, name: label, type: 'concept', aliases: [], chunkIds: [`${id}:chunk-0`] }],
  }
}

/** 仅延迟真实外部 I/O 的返回点，持久状态与发布仍执行生产代码。 */
function latch() {
  let open!: () => void
  const promise = new Promise<void>((resolve) => {
    open = resolve
  })
  return { promise, open }
}

describe.sequential('knowledge publication actual SQLite and Qdrant', () => {
  let lease: QdrantContainerLease | undefined
  let directory: string
  let database: string
  let collection: string
  let a: KnowledgeStore
  let b: KnowledgeStore

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'hai-knowledge-publication-'))
    database = join(directory, 'state.sqlite')
    await reldb.close()
    expect((await reldb.init({ type: 'sqlite', database })).success).toBe(true)
    await vecdb.close()
    lease = await acquireQdrantContainer()
    expect((await vecdb.init({ type: 'qdrant', url: lease.url })).success).toBe(true)
  }, 120_000)

  beforeEach(async () => {
    collection = `knowledge_${randomUUID().replaceAll('-', '')}`
    a = createDbStoreProviderFromModules().createKnowledgeStore!()
    b = createDbStoreProviderFromModules().createKnowledgeStore!()
    await a.initialize(collection, 2)
    await a.registerCollection(collection, 2)
    await b.initialize(collection, 2)
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    if (collection && vecdb.isInitialized)
      await vecdb.collection.drop(collection)
  })

  afterAll(async () => {
    try {
      await vecdb.close()
      await reldb.close()
    }
    finally {
      await lease?.release()
      if (directory)
        await rm(directory, { recursive: true, force: true })
    }
  })

  async function contents(store = b) {
    return (await store.searchVectors(collection, [1, 0], { topK: 50 })).map(hit => hit.content).sort()
  }

  it('10块缩为2块，只能检索新版本且旧实体/关系和向量实际删除', async () => {
    await a.replaceDocument(revision(collection, 10, 'old'))
    expect(await contents()).toHaveLength(10)
    await b.replaceDocument(revision(collection, 2, 'new'))
    expect(await contents()).toEqual(['new-0', 'new-1'])
    expect(await a.findByEntityName('old', { collection })).toEqual([])
    expect(await a.findByEntityName('new', { collection })).toHaveLength(1)
    expect((await a.listDocuments(collection))[0]).toMatchObject({ chunkCount: 2, title: 'new' })
    expect(await vecdb.vector.count(collection)).toEqual({ success: true, data: 2 })
  })

  it('另一实例暂存期间仍读完整旧版，并发更新只有一个发布者', async () => {
    await a.replaceDocument(revision(collection, 10, 'old'))
    const entered = latch()
    const resume = latch()
    const upsert = vecdb.vector.upsert.bind(vecdb.vector)
    vi.spyOn(vecdb.vector, 'upsert').mockImplementationOnce(async (...args) => {
      const result = await upsert(...args)
      entered.open()
      await resume.promise
      return result
    })
    const pending = a.replaceDocument(revision(collection, 2, 'new'))
    try {
      await entered.promise
      expect(await contents()).toEqual(Array.from({ length: 10 }, (_, index) => `old-${index}`).sort())
      await expect(b.replaceDocument(revision(collection, 3, 'loser'))).rejects.toThrow('already being rebuilt')
    }
    finally {
      resume.open()
      await pending
    }
    expect(await contents()).toEqual(['new-0', 'new-1'])
  })

  it('count之后新增的高分暂存向量不能挤掉完整旧版', async () => {
    const previous = revision(collection, 10, 'old')
    previous.chunks.forEach((chunk) => {
      chunk.vector = [0, 1]
    })
    await a.replaceDocument(previous)
    const entered = latch()
    const write = latch()
    const written = latch()
    const finish = latch()
    const upsert = vecdb.vector.upsert.bind(vecdb.vector)
    vi.spyOn(vecdb.vector, 'upsert').mockImplementationOnce(async (...args) => {
      entered.open()
      await write.promise
      const result = await upsert(...args)
      written.open()
      await finish.promise
      return result
    })
    const pending = a.replaceDocument(revision(collection, 100, 'staging'))
    try {
      await entered.promise
      const count = vecdb.vector.count.bind(vecdb.vector)
      vi.spyOn(vecdb.vector, 'count').mockImplementationOnce(async (...args) => {
        const stale = await count(...args)
        write.open()
        await written.promise
        return stale
      })
      expect(await contents()).toHaveLength(10)
    }
    finally {
      write.open()
      finish.open()
      await pending
    }
    expect(await contents()).toHaveLength(50)
  })

  it('发布成功但旧向量删除失败明确返回cleanupPending，repair恢复后真实计数一致', async () => {
    await a.replaceDocument(revision(collection, 10, 'old'))
    vi.spyOn(vecdb.vector, 'delete').mockResolvedValue(err(HaiVecdbError.DELETE_FAILED, 'Injected cleanup failure'))
    expect(await a.replaceDocument(revision(collection, 2, 'new'))).toEqual({ cleanupPending: true })
    expect(await contents()).toEqual(['new-0', 'new-1'])
    vi.restoreAllMocks()
    await b.repair(collection)
    expect(await vecdb.vector.count(collection)).toEqual({ success: true, data: 2 })
  })

  it('外部向量部分写成功且删除失败，重开SQL和Provider后由持久清单补偿', async () => {
    await a.replaceDocument(revision(collection, 10, 'old'))
    const upsert = vecdb.vector.upsert.bind(vecdb.vector)
    vi.spyOn(vecdb.vector, 'upsert').mockImplementationOnce(async (name, chunks) => {
      expect((await upsert(name, chunks.slice(0, 1))).success).toBe(true)
      return err(HaiVecdbError.UPDATE_FAILED, 'Injected partial vector failure')
    })
    vi.spyOn(vecdb.vector, 'delete').mockResolvedValue(err(HaiVecdbError.DELETE_FAILED, 'Injected delete failure'))
    await expect(a.replaceDocument(revision(collection, 2, 'partial'))).rejects.toThrow('durable cleanup is pending')
    expect(await contents()).toHaveLength(10)
    expect(await b.findByEntityName('partial', { collection })).toEqual([])
    vi.restoreAllMocks()
    await reldb.close()
    expect((await reldb.init({ type: 'sqlite', database })).success).toBe(true)
    b = createDbStoreProviderFromModules().createKnowledgeStore!()
    expect(await b.repair(collection)).toMatchObject({ processed: 1, total: 1 })
    expect(await vecdb.vector.count(collection)).toEqual({ success: true, data: 10 })
    expect(await contents()).toHaveLength(10)
  })

  it('sQL最终发布失败不会暴露新实体或分块，也不会丢失补偿', async () => {
    await a.replaceDocument(revision(collection, 10, 'old'))
    const execute = reldb.sql.execute.bind(reldb.sql)
    let failed = false
    vi.spyOn(reldb.sql, 'execute').mockImplementation(async (sql, params) => {
      if (!failed && sql.startsWith('UPDATE hai_ai_knowledge_documents') && params?.some(value => typeof value === 'string' && value.includes('"title":"new"') && !value.includes('"pending":'))) {
        failed = true
        return { success: false, error: { code: 'hai:reldb:002', message: 'Injected publication failure' } }
      }
      return execute(sql, params)
    })
    await expect(a.replaceDocument(revision(collection, 2, 'new'))).rejects.toThrow()
    expect(failed).toBe(true)
    expect(await contents()).toHaveLength(10)
    expect(await b.findByEntityName('new', { collection })).toEqual([])
    vi.restoreAllMocks()
    await b.repair(collection)
    expect(await vecdb.vector.count(collection)).toEqual({ success: true, data: 10 })
  })

  it('过期owner恢复不能发布，永久补偿墓碑还能清理其迟到外部写入', async () => {
    await a.replaceDocument(revision(collection, 10, 'old'))
    const next = revision(collection, 2, 'expired')
    const entered = latch()
    const resume = latch()
    const upsert = vecdb.vector.upsert.bind(vecdb.vector)
    vi.spyOn(vecdb.vector, 'upsert').mockImplementationOnce(async (...args) => {
      entered.open()
      await resume.promise
      return upsert(...args)
    })
    const pending = a.replaceDocument(next)
    // 立即挂失败观察器，避免受控延迟结束后产生未处理 rejection。
    const rejected = expect(pending).rejects.toThrow('revoked')
    try {
      await entered.promise
      const provider = createDbStoreProviderFromModules()
      const manifests = provider.createRelStore<KnowledgeDocumentManifest>('hai_ai_knowledge_documents', { hasObjectId: true, hasSessionId: true })
      const row = (await manifests.query({ objectId: collection }))[0]
      const current = await manifests.readVersioned(row.key)
      expect(current?.data.pending).toBeDefined()
      await manifests.compareAndSwap(row.key, {
        expectedVersion: current?.version,
        data: { ...current!.data, pending: { ...current!.data.pending!, deadline: await manifests.currentTime() - 1 } },
      })
      await b.repair(collection)
      await b.replaceDocument(revision(collection, 3, 'winner'))
    }
    finally {
      resume.open()
      await rejected
    }
    expect(await contents()).toEqual(['winner-0', 'winner-1', 'winner-2'])
    // 模拟请求结果未知后在服务端迟到的重放；墓碑不能被第一次删除成功清除。
    expect((await upsert(collection, next.chunks)).success).toBe(true)
    expect((await vecdb.vector.count(collection))).toEqual({ success: true, data: 5 })
    await b.repair(collection)
    expect((await vecdb.vector.count(collection))).toEqual({ success: true, data: 3 })
  })

  it('删除先撤销可见版本，清理失败报告；集合新代不会恢复旧内容', async () => {
    await a.replaceDocument(revision(collection, 10, 'old'))
    vi.spyOn(vecdb.vector, 'delete').mockResolvedValue(err(HaiVecdbError.DELETE_FAILED, 'Injected removal failure'))
    await expect(a.removeDocument('guide', collection)).rejects.toThrow('Injected removal failure')
    expect(await contents()).toEqual([])
    expect(await b.findByEntityName('old', { collection })).toEqual([])
    vi.restoreAllMocks()
    await b.repair(collection)
    expect((await vecdb.vector.count(collection))).toEqual({ success: true, data: 0 })
    await a.replaceDocument(revision(collection, 2, 'again'))
    await b.deleteCollection(collection)
    expect(await a.collectionExists(collection)).toBe(false)
    await a.registerCollection(collection, 2)
    expect(await contents()).toEqual([])
  })

  it('超过一页的集合删除按批完成，repair分页进度包含永久墓碑', async () => {
    for (let index = 0; index < 101; index++) {
      await a.replaceDocument({ ...revision(collection, 0, `document-${index}`), documentId: `document-${index}`, entities: [] })
    }
    await b.deleteCollection(collection)
    expect(await a.collectionExists(collection)).toBe(false)
    expect(await a.repair(collection, { offset: 0, limit: 100 })).toEqual({ processed: 100, total: 101 })
    expect(await a.repair(collection, { offset: 100, limit: 100 })).toEqual({ processed: 1, total: 101 })
    await a.registerCollection(collection, 2)
    expect(await a.listDocuments(collection)).toEqual([])
  })
})
