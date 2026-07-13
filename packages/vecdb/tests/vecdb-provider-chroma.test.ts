/**
 * Chroma Provider 单元测试
 *
 * 通过 mock `chromadb` 与 `node:child_process` 验证连接生命周期、集合与向量操作，
 * 以及嵌入式模式的本地服务拉起/关闭，不连接真实 Chroma 服务。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createChromaProvider } from '../src/providers/vecdb-provider-chroma.js'

const spawnMock = vi.hoisted(() => vi.fn(() => ({ on: vi.fn(), kill: vi.fn() })))
vi.mock('node:child_process', () => ({ spawn: spawnMock }))

interface FakeRecord {
  embedding: number[]
  document: string | null
  metadata: Record<string, unknown>
}

const chroma = vi.hoisted(() => {
  const store = new Map<string, { metadata: Record<string, unknown>, records: Map<string, FakeRecord> }>()
  const ctorMock = vi.fn()
  const heartbeatMock = vi.fn(async () => 1)
  return { store, ctorMock, heartbeatMock }
})

vi.mock('chromadb', () => {
  function makeCollection(name: string) {
    const col = chroma.store.get(name)!
    const write = async (params: { ids: string[], embeddings: number[][], documents?: (string | null)[], metadatas?: (Record<string, unknown> | null)[] }) => {
      params.ids.forEach((id, index) => {
        col.records.set(id, {
          embedding: params.embeddings[index],
          document: params.documents?.[index] ?? null,
          metadata: params.metadatas?.[index] ?? {},
        })
      })
    }
    return {
      metadata: col.metadata,
      add: write,
      upsert: write,
      async delete({ ids }: { ids: string[] }) {
        ids.forEach(id => col.records.delete(id))
      },
      async query({ nResults }: { nResults?: number }) {
        const entries = [...col.records.entries()].slice(0, nResults ?? 10)
        return {
          ids: [entries.map(([id]) => id)],
          distances: [entries.map(() => 0)],
          metadatas: [entries.map(([, record]) => record.metadata)],
          documents: [entries.map(([, record]) => record.document)],
        }
      },
      async count() {
        return col.records.size
      },
    }
  }

  class ChromaClient {
    constructor(params: unknown) {
      chroma.ctorMock(params)
    }

    heartbeat = chroma.heartbeatMock
    async getOrCreateCollection({ name, metadata }: { name: string, metadata?: Record<string, unknown> }) {
      if (!chroma.store.has(name))
        chroma.store.set(name, { metadata: metadata ?? {}, records: new Map() })
      return makeCollection(name)
    }

    async getCollection({ name }: { name: string }) {
      if (!chroma.store.has(name))
        throw new Error(`collection ${name} not found`)
      return makeCollection(name)
    }

    async deleteCollection({ name }: { name: string }) {
      chroma.store.delete(name)
    }

    async listCollections() {
      return [...chroma.store.keys()].map(name => ({ name }))
    }
  }

  return { ChromaClient }
})

async function connectDirect() {
  const provider = createChromaProvider()
  const result = await provider.connect({ type: 'chroma', url: 'http://localhost:8000', host: 'localhost', port: 8000, serverCommand: 'chroma', startupTimeout: 30_000 })
  expect(result.success).toBe(true)
  return provider
}

beforeEach(() => {
  vi.clearAllMocks()
  chroma.store.clear()
  chroma.heartbeatMock.mockResolvedValue(1)
})

describe('createChromaProvider', () => {
  it('直连模式连接后 isConnected 为 true，不拉起本地服务', async () => {
    const provider = await connectDirect()
    expect(provider.isConnected()).toBe(true)
    expect(spawnMock).not.toHaveBeenCalled()
    expect(chroma.ctorMock).toHaveBeenCalledWith(expect.objectContaining({ path: 'http://localhost:8000' }))
  })

  it('嵌入式模式（有 path 无 url）拉起本地服务', async () => {
    const provider = createChromaProvider()
    const result = await provider.connect({ type: 'chroma', path: './data/chroma', host: 'localhost', port: 8000, serverCommand: 'chroma', startupTimeout: 30_000 })
    expect(result.success).toBe(true)
    expect(spawnMock).toHaveBeenCalledWith('chroma', expect.arrayContaining(['run', '--path', './data/chroma']), expect.any(Object))
    await provider.close()
  })

  it('心跳超时时返回连接失败', async () => {
    chroma.heartbeatMock.mockRejectedValue(new Error('refused'))
    const provider = createChromaProvider()
    const result = await provider.connect({ type: 'chroma', path: './data/chroma', host: 'localhost', port: 8000, serverCommand: 'chroma', startupTimeout: 200 })
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe('hai:vecdb:001')
  })

  it('创建集合并写入维度/度量，重复创建报错', async () => {
    const provider = await connectDirect()

    const created = await provider.collection.create('docs', { dimension: 3, metric: 'cosine' })
    expect(created.success).toBe(true)

    const existsResult = await provider.collection.exists('docs')
    expect(existsResult.success && existsResult.data).toBe(true)

    const infoResult = await provider.collection.info('docs')
    expect(infoResult.success && infoResult.data.dimension).toBe(3)
    expect(infoResult.success && infoResult.data.metric).toBe('cosine')

    const dup = await provider.collection.create('docs', { dimension: 3 })
    expect(dup.success).toBe(false)
  })

  it('upsert 后可搜索并返回内容与元数据', async () => {
    const provider = await connectDirect()
    await provider.collection.create('docs', { dimension: 3 })

    const upsertResult = await provider.vector.upsert('docs', [
      { id: 'd1', vector: [0.1, 0.2, 0.3], content: '文档一', metadata: { objectId: 'u1' } },
      { id: 'd2', vector: [0.4, 0.5, 0.6], content: '文档二', metadata: { objectId: 'u1' } },
    ])
    expect(upsertResult.success).toBe(true)

    const countResult = await provider.vector.count('docs')
    expect(countResult.success && countResult.data).toBe(2)

    const searchResult = await provider.vector.search('docs', [0.1, 0.2, 0.3], { topK: 1 })
    expect(searchResult.success).toBe(true)
    if (!searchResult.success)
      return
    expect(searchResult.data).toHaveLength(1)
    expect(searchResult.data[0].content).toBe('文档一')
    expect(searchResult.data[0].metadata).toEqual({ objectId: 'u1' })
    expect(searchResult.data[0].score).toBe(1)
  })

  it('维度不匹配时插入报错', async () => {
    const provider = await connectDirect()
    await provider.collection.create('docs', { dimension: 3 })

    const result = await provider.vector.insert('docs', [
      { id: 'd1', vector: [0.1, 0.2], content: 'x' },
    ])
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe('hai:vecdb:005')
  })

  it('删除向量与删除集合', async () => {
    const provider = await connectDirect()
    await provider.collection.create('docs', { dimension: 3 })
    await provider.vector.upsert('docs', [{ id: 'd1', vector: [0.1, 0.2, 0.3] }])

    const delVec = await provider.vector.delete('docs', ['d1'])
    expect(delVec.success).toBe(true)
    const countResult = await provider.vector.count('docs')
    expect(countResult.success && countResult.data).toBe(0)

    const dropResult = await provider.collection.drop('docs')
    expect(dropResult.success).toBe(true)
    const existsResult = await provider.collection.exists('docs')
    expect(existsResult.success && existsResult.data).toBe(false)
  })

  it('close 后 isConnected 为 false', async () => {
    const provider = await connectDirect()
    await provider.close()
    expect(provider.isConnected()).toBe(false)
  })
})
