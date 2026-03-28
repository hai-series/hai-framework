/**
 * AI Knowledge 子模块功能测试
 *
 * 覆盖 setup / ingest / retrieve / ask / findByEntity / listEntities。
 * 使用 mock KnowledgeStore、datapipe、llm、embedding。
 */

import type { EmbeddingOperations } from '../src/embedding/ai-embedding-types.js'
import type { LLMOperations } from '../src/llm/ai-llm-types.js'
import type { KnowledgeStore } from '../src/store/ai-store-types.js'
import { describe, expect, it, vi } from 'vitest'
import { HaiAIError } from '../src/ai-types.js'
import { createKnowledgeOperations } from '../src/knowledge/ai-knowledge-functions.js'

// ─── Mock 工厂 ───

function createMockLLM(entityJson?: string): LLMOperations {
  return {
    chat: vi.fn(async (opts: Record<string, unknown>) => {
      const messages = opts.messages as Array<{ role: string, content: string }>
      const isEntityExtraction = messages?.some(m => m.content?.includes('named entity'))

      // 实体提取调用
      if (isEntityExtraction || (entityJson !== undefined)) {
        return {
          success: true as const,
          data: {
            id: 'entity-call',
            object: 'chat.completion' as const,
            created: Date.now(),
            model: 'test-model',
            choices: [{
              index: 0,
              message: {
                role: 'assistant' as const,
                content: entityJson ?? '[]',
              },
              finish_reason: 'stop' as const,
            }],
            usage: { prompt_tokens: 50, completion_tokens: 30, total_tokens: 80 },
          },
        }
      }

      // 普通 chat 调用（ask）
      return {
        success: true as const,
        data: {
          id: 'chat-call',
          object: 'chat.completion' as const,
          created: Date.now(),
          model: 'gpt-4o-mini',
          choices: [{
            index: 0,
            message: { role: 'assistant' as const, content: 'This is the answer based on the context.' },
            finish_reason: 'stop' as const,
          }],
          usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        },
      }
    }),
    chatStream: vi.fn(),
  } as unknown as LLMOperations
}

function createMockEmbedding(): EmbeddingOperations {
  return {
    embed: vi.fn(async () => ({
      success: true as const,
      data: { model: 'test', data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }], usage: { prompt_tokens: 1, total_tokens: 1 } },
    })),
    embedText: vi.fn(async () => ({
      success: true as const,
      data: [0.1, 0.2, 0.3],
    })),
    embedBatch: vi.fn(async (texts: string[]) => ({
      success: true as const,
      data: texts.map(() => [0.1, 0.2, 0.3]),
    })),
  } as unknown as EmbeddingOperations
}

function createMockKnowledgeStore() {
  const vectors: Array<{ id: string, vector: number[], content?: string, metadata?: Record<string, unknown> }> = []
  const documents = new Map<string, { documentId: string, collection: string, title: string | null, url: string | null, chunkCount: number, createdAt: number }>()
  const entities = new Map<string, { id: string, name: string, type: string, aliases?: string[], description?: string }>()
  const entityDocs: Array<{ entityId: string, documentId: string, chunkId?: string, collection: string, relevance?: number, context?: string }> = []

  const store: KnowledgeStore = {
    initialize: vi.fn(async () => {}),
    upsertEntity: vi.fn(async (entity) => { entities.set(entity.id, entity) }),
    findEntitiesByName: vi.fn(async () => []),
    listEntities: vi.fn(async () => []),
    insertEntityDocument: vi.fn(async (rel) => { entityDocs.push(rel) }),
    findDocumentsByEntityIds: vi.fn(async () => []),
    findByEntityName: vi.fn(async () => []),
    removeDocumentEntityRelations: vi.fn(async () => {}),
    upsertDocument: vi.fn(async (doc) => { documents.set(`${doc.documentId}:${doc.collection}`, { ...doc, title: doc.title ?? null, url: doc.url ?? null }) }),
    getDocument: vi.fn(async (docId: string, collection: string) => documents.get(`${docId}:${collection}`) ?? undefined),
    listDocuments: vi.fn(async () => []),
    listDocumentEntityCounts: vi.fn(async () => new Map<string, number>()),
    removeDocument: vi.fn(async (docId: string, collection: string) => { documents.delete(`${docId}:${collection}`) }),
    upsertVectors: vi.fn(async (_collection: string, vecs: typeof vectors) => { vectors.push(...vecs) }),
    searchVectors: vi.fn(async (_collection: string, _vector: number[], options?: { topK?: number }) => {
      const topK = options?.topK ?? 10
      return vectors.slice(0, topK).map((v, i) => ({
        id: v.id,
        score: 0.95 - i * 0.05,
        content: v.content,
        metadata: v.metadata,
      }))
    }),
    removeVectors: vi.fn(async () => {}),
    ensureCollection: vi.fn(async () => {}),
  }

  return { store, _vectors: vectors, _documents: documents, _entities: entities, _entityDocs: entityDocs }
}

function createMockDatapipe() {
  return {
    clean: vi.fn((text: string) => ({ success: true, data: text.trim() })),
    chunk: vi.fn((text: string, _options: Record<string, unknown>) => ({
      success: true,
      data: [
        { index: 0, content: text.slice(0, Math.floor(text.length / 2)), metadata: {} },
        { index: 1, content: text.slice(Math.floor(text.length / 2)), metadata: {} },
      ],
    })),
  }
}

const DEFAULT_CONFIG = {
  collection: 'hai_ai_knowledge',
  dimension: 3,
  enableEntityExtraction: false,
  chunkMode: 'markdown' as const,
  chunkMaxSize: 1500,
  chunkOverlap: 200,
  entityBoostWeight: 0.15,
}

// ─── setup ───

describe('knowledge setup', () => {
  it('正常初始化：调用 store.initialize', async () => {
    const { store } = createMockKnowledgeStore()

    const ops = createKnowledgeOperations(
      DEFAULT_CONFIG,
      createMockLLM(),
      createMockEmbedding(),
      createMockDatapipe(),
      store,
    )

    const result = await ops.setup()
    expect(result.success).toBe(true)

    // 应调用 store.initialize
    expect(store.initialize).toHaveBeenCalledWith('hai_ai_knowledge', 3)
  })

  it('store.initialize 抛出时 setup 返回错误', async () => {
    const { store } = createMockKnowledgeStore()
    store.initialize = vi.fn(async () => {
      throw new Error('init failed')
    })

    const ops = createKnowledgeOperations(
      DEFAULT_CONFIG,
      createMockLLM(),
      createMockEmbedding(),
      createMockDatapipe(),
      store,
    )

    const result = await ops.setup()
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiAIError.KNOWLEDGE_SETUP_FAILED.code)
  })

  it('自定义 collection 和 dimension', async () => {
    const { store } = createMockKnowledgeStore()

    const ops = createKnowledgeOperations(
      DEFAULT_CONFIG,
      createMockLLM(),
      createMockEmbedding(),
      createMockDatapipe(),
      store,
    )

    const result = await ops.setup({ collection: 'custom-kb', dimension: 768 })
    expect(result.success).toBe(true)
    expect(store.initialize).toHaveBeenCalledWith('custom-kb', 768)
  })

  it('未提供 store 时 setup 返回错误', async () => {
    const ops = createKnowledgeOperations(
      DEFAULT_CONFIG,
      createMockLLM(),
      createMockEmbedding(),
      createMockDatapipe(),
    )

    const result = await ops.setup()
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiAIError.KNOWLEDGE_SETUP_FAILED.code)
  })
})

// ─── ingest ───

describe('knowledge ingest', () => {
  async function setupOps(options?: {
    enableEntityExtraction?: boolean
    entityJson?: string
    datapipe?: ReturnType<typeof createMockDatapipe>
    store?: ReturnType<typeof createMockKnowledgeStore>
  }) {
    const { store, _vectors } = options?.store ?? createMockKnowledgeStore()
    const datapipe = options?.datapipe ?? createMockDatapipe()
    const embedding = createMockEmbedding()
    const llm = createMockLLM(options?.entityJson)

    const config = {
      ...DEFAULT_CONFIG,
      enableEntityExtraction: options?.enableEntityExtraction ?? false,
    }

    const ops = createKnowledgeOperations(
      config,
      llm,
      embedding,
      datapipe,
      store,
    )

    // 先 setup
    await ops.setup()

    return { ops, store, datapipe, embedding, llm, _vectors }
  }

  it('未 setup 时 ingest 返回错误', async () => {
    const { store } = createMockKnowledgeStore()
    const ops = createKnowledgeOperations(
      DEFAULT_CONFIG,
      createMockLLM(),
      createMockEmbedding(),
      createMockDatapipe(),
      store,
    )

    const result = await ops.ingest({ documentId: 'doc-1', content: 'Hello world' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiAIError.KNOWLEDGE_NOT_SETUP.code)
    }
  })

  it('正常导入：清洗 → 分块 → 向量化 → 存入 store', async () => {
    const { ops, store, datapipe, embedding } = await setupOps()

    const result = await ops.ingest({
      documentId: 'doc-1',
      content: 'This is a test document about AI and machine learning.',
      title: 'AI Overview',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.documentId).toBe('doc-1')
      expect(result.data.chunkCount).toBe(2) // datapipe 返回 2 个 chunk
      expect(result.data.entities).toEqual([]) // 未开启实体提取
      expect(result.data.duration).toBeGreaterThanOrEqual(0)
    }

    // datapipe.clean 应被调用
    expect(datapipe!.clean).toHaveBeenCalled()
    // datapipe.chunk 应被调用
    expect(datapipe!.chunk).toHaveBeenCalled()
    // embedding.embedBatch 应被调用（2 个 chunk）
    expect(embedding.embedBatch).toHaveBeenCalled()
    // store.upsertVectors 应被调用
    expect(store.upsertVectors).toHaveBeenCalledWith('hai_ai_knowledge', expect.any(Array))
    // store.upsertDocument 应被调用
    expect(store.upsertDocument).toHaveBeenCalled()
  })

  it('分块失败时退回整文本单一 chunk', async () => {
    const failDatapipe = {
      clean: vi.fn((text: string) => ({ success: true, data: text })),
      chunk: vi.fn(() => ({ success: false, error: { message: 'chunk failed' } })),
    }
    const { ops } = await setupOps({ datapipe: failDatapipe as unknown as ReturnType<typeof createMockDatapipe> })

    const result = await ops.ingest({
      documentId: 'doc-2',
      content: 'Short text.',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.chunkCount).toBe(1)
    }
  })

  it('导入时传入 cleanOptions 与 chunkOptions', async () => {
    const { ops, datapipe } = await setupOps()

    const result = await ops.ingest({
      documentId: 'doc-3b',
      content: '<p>Hello world</p>',
      cleanOptions: { removeHtml: true },
      chunkOptions: { mode: 'paragraph', maxSize: 500, overlap: 50 },
    })

    expect(result.success).toBe(true)
    // datapipe.clean 应收到 removeHtml: true
    expect(datapipe!.clean).toHaveBeenCalledWith('<p>Hello world</p>', { removeHtml: true })
    // datapipe.chunk 应收到 mode: 'paragraph'
    expect(datapipe!.chunk).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ mode: 'paragraph' }))
  })

  it('开启实体提取时提取并存储实体', async () => {
    const entityJson = JSON.stringify([
      { name: 'Alice', type: 'person', description: 'A researcher' },
    ])

    const { ops, store } = await setupOps({
      enableEntityExtraction: true,
      entityJson,
    })

    const result = await ops.ingest({
      documentId: 'doc-3',
      content: 'Alice published a paper on AI.',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      // 实体应被提取
      expect(result.data.entities.length).toBeGreaterThan(0)
      expect(result.data.entities[0].name).toBe('Alice')
      expect(result.data.entities[0].type).toBe('person')
    }

    // store.upsertEntity 应被调用
    expect(store.upsertEntity).toHaveBeenCalled()
  })

  it('store.upsertVectors 抛出时 ingest 返回错误', async () => {
    const mockStore = createMockKnowledgeStore()
    mockStore.store.upsertVectors = vi.fn(async () => {
      throw new Error('upsert failed')
    })

    const ops = createKnowledgeOperations(
      DEFAULT_CONFIG,
      createMockLLM(),
      createMockEmbedding(),
      createMockDatapipe(),
      mockStore.store,
    )
    await ops.setup()

    const result = await ops.ingest({ documentId: 'doc-4', content: 'Test' })
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiAIError.KNOWLEDGE_INGEST_FAILED.code)
  })
})

// ─── retrieve ───

describe('knowledge retrieve', () => {
  async function setupWithData() {
    const { store } = createMockKnowledgeStore()
    const datapipe = createMockDatapipe()
    const embedding = createMockEmbedding()
    const llm = createMockLLM('[]')

    const ops = createKnowledgeOperations(
      DEFAULT_CONFIG,
      llm,
      embedding,
      datapipe,
      store,
    )

    await ops.setup()

    // 导入一个文档，让 store 有内容
    await ops.ingest({
      documentId: 'doc-1',
      content: 'Artificial intelligence is transforming the world of technology.',
      title: 'AI Overview',
      url: 'https://example.com/ai',
    })

    return { ops, store, embedding }
  }

  it('未 setup 时返回错误', async () => {
    const { store } = createMockKnowledgeStore()
    const ops = createKnowledgeOperations(
      DEFAULT_CONFIG,
      createMockLLM(),
      createMockEmbedding(),
      createMockDatapipe(),
      store,
    )

    const result = await ops.retrieve('test query')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiAIError.KNOWLEDGE_NOT_SETUP.code)
    }
  })

  it('正常检索：返回结果和信源', async () => {
    const { ops } = await setupWithData()

    const result = await ops.retrieve('What is AI?')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.items.length).toBeGreaterThan(0)
      expect(result.data.query).toBe('What is AI?')
      expect(result.data.citations.length).toBeGreaterThan(0)
      expect(result.data.duration).toBeGreaterThanOrEqual(0)

      // 每个 item 应有 citation
      for (const item of result.data.items) {
        expect(item.citation).toBeDefined()
        expect(item.citation.collection).toBe('hai_ai_knowledge')
        expect(item.score).toBeGreaterThan(0)
      }
    }
  })

  it('检索结果包含文档元数据', async () => {
    const { ops } = await setupWithData()

    const result = await ops.retrieve('AI technology')
    expect(result.success).toBe(true)
    if (result.success) {
      const item = result.data.items[0]
      // 元数据应包含导入时的信息
      expect(item.metadata?.documentId).toBe('doc-1')
      expect(item.metadata?.title).toBe('AI Overview')
    }
  })

  it('自定义 topK', async () => {
    const { ops } = await setupWithData()

    const result = await ops.retrieve('AI', { topK: 1 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.items.length).toBeLessThanOrEqual(1)
    }
  })
})

// ─── ask ───

describe('knowledge ask', () => {
  async function setupWithData() {
    const { store } = createMockKnowledgeStore()
    const datapipe = createMockDatapipe()
    const embedding = createMockEmbedding()
    const llm = createMockLLM('[]')

    const ops = createKnowledgeOperations(
      DEFAULT_CONFIG,
      llm,
      embedding,
      datapipe,
      store,
    )

    await ops.setup()
    await ops.ingest({
      documentId: 'doc-1',
      content: 'Artificial intelligence is transforming the world.',
      title: 'AI Overview',
    })

    return { ops, llm }
  }

  it('正常问答：检索 + LLM 生成', async () => {
    const { ops } = await setupWithData()

    const result = await ops.ask('What is AI?')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.answer).toBeTruthy()
      expect(result.data.query).toBe('What is AI?')
      expect(result.data.citations.length).toBeGreaterThan(0)
      expect(result.data.context.length).toBeGreaterThan(0)
      expect(result.data.model).toBe('test-model')
    }
  })

  it('ask 返回 usage 信息', async () => {
    const { ops } = await setupWithData()

    const result = await ops.ask('Tell me about AI')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.usage).toBeDefined()
      expect(result.data.usage?.total_tokens).toBeGreaterThan(0)
    }
  })
})

// ─── findByEntity / listEntities ───

describe('knowledge 实体查询', () => {
  it('findByEntity — 正常返回（空结果）', async () => {
    const { store } = createMockKnowledgeStore()
    const ops = createKnowledgeOperations(
      DEFAULT_CONFIG,
      createMockLLM(),
      createMockEmbedding(),
      createMockDatapipe(),
      store,
    )

    const result = await ops.findByEntity('Alice')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual([])
    }
  })

  it('listEntities — 正常返回（空结果）', async () => {
    const { store } = createMockKnowledgeStore()
    const ops = createKnowledgeOperations(
      DEFAULT_CONFIG,
      createMockLLM(),
      createMockEmbedding(),
      createMockDatapipe(),
      store,
    )

    const result = await ops.listEntities()
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual([])
    }
  })

  it('listEntities — 传递过滤参数', async () => {
    const { store } = createMockKnowledgeStore()
    const ops = createKnowledgeOperations(
      DEFAULT_CONFIG,
      createMockLLM(),
      createMockEmbedding(),
      createMockDatapipe(),
      store,
    )

    const result = await ops.listEntities({ type: 'person', keyword: 'Alice', limit: 5 })
    expect(result.success).toBe(true)

    // 验证 store.listEntities 被正确调用并传递过滤参数
    expect(store.listEntities).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'person', keyword: 'Alice', limit: 5 }),
    )
  })
})

// ─── listDocuments ───

describe('knowledge listDocuments', () => {
  it('未 setup 时返回 KNOWLEDGE_NOT_SETUP', async () => {
    const { store } = createMockKnowledgeStore()
    const ops = createKnowledgeOperations(
      DEFAULT_CONFIG,
      createMockLLM(),
      createMockEmbedding(),
      createMockDatapipe(),
      store,
    )

    const result = await ops.listDocuments()
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiAIError.KNOWLEDGE_NOT_SETUP.code)
  })

  it('正常返回文档列表（空结果）', async () => {
    const { store } = createMockKnowledgeStore()
    const ops = createKnowledgeOperations(
      DEFAULT_CONFIG,
      createMockLLM(),
      createMockEmbedding(),
      createMockDatapipe(),
      store,
    )
    await ops.setup()

    const result = await ops.listDocuments()
    expect(result.success).toBe(true)
    if (result.success)
      expect(result.data).toEqual([])
  })

  it('传递分页参数', async () => {
    const { store } = createMockKnowledgeStore()
    const ops = createKnowledgeOperations(
      DEFAULT_CONFIG,
      createMockLLM(),
      createMockEmbedding(),
      createMockDatapipe(),
      store,
    )
    await ops.setup()

    const result = await ops.listDocuments({ offset: 10, limit: 5 })
    expect(result.success).toBe(true)

    // 验证 store.listDocuments 被调用且包含分页参数
    expect(store.listDocuments).toHaveBeenCalledWith(
      'hai_ai_knowledge',
      expect.objectContaining({ offset: 10, limit: 5 }),
    )
  })
})

// ─── removeDocument ───

describe('knowledge removeDocument', () => {
  it('未 setup 时返回 KNOWLEDGE_NOT_SETUP', async () => {
    const { store } = createMockKnowledgeStore()
    const ops = createKnowledgeOperations(
      DEFAULT_CONFIG,
      createMockLLM(),
      createMockEmbedding(),
      createMockDatapipe(),
      store,
    )

    const result = await ops.removeDocument('doc-1')
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiAIError.KNOWLEDGE_NOT_SETUP.code)
  })

  it('正常删除文档 — 清理向量 + 实体关联 + 元数据', async () => {
    const { store } = createMockKnowledgeStore()

    const ops = createKnowledgeOperations(
      DEFAULT_CONFIG,
      createMockLLM(),
      createMockEmbedding(),
      createMockDatapipe(),
      store,
    )
    await ops.setup()

    // 先导入一个文档，让 store 有数据
    await ops.ingest({
      documentId: 'doc-1',
      content: 'Test document for removal.',
    })

    const result = await ops.removeDocument('doc-1')
    expect(result.success).toBe(true)

    // 验证 store.removeVectors 被调用
    expect(store.removeVectors).toHaveBeenCalled()

    // 验证 store.removeDocumentEntityRelations 被调用
    expect(store.removeDocumentEntityRelations).toHaveBeenCalled()

    // 验证 store.removeDocument 被调用
    expect(store.removeDocument).toHaveBeenCalled()
  })
})

// ─── ingestBatch ───

describe('knowledge ingestBatch', () => {
  it('批量导入多个文档 — 全部成功', async () => {
    const { store } = createMockKnowledgeStore()

    const ops = createKnowledgeOperations(
      DEFAULT_CONFIG,
      createMockLLM(),
      createMockEmbedding(),
      createMockDatapipe(),
      store,
    )
    await ops.setup()

    const inputs = [
      { documentId: 'doc-1', content: 'First document content' },
      { documentId: 'doc-2', content: 'Second document content' },
    ]

    const progressCalls: unknown[] = []
    const result = await ops.ingestBatch(inputs, (progress) => {
      progressCalls.push(progress)
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.successCount).toBe(2)
      expect(result.data.failureCount).toBe(0)
      expect(result.data.results).toHaveLength(2)
      expect(result.data.duration).toBeGreaterThanOrEqual(0)
    }

    // 验证 onProgress 被调用两次
    expect(progressCalls).toHaveLength(2)
  })

  it('部分导入失败 — 不中断后续', async () => {
    const { store } = createMockKnowledgeStore()
    const embedding = createMockEmbedding()

    // 第一次 embedBatch 失败，第二次成功
    let callCount = 0
    embedding.embedBatch = vi.fn(async (texts: string[]) => {
      callCount++
      if (callCount === 1)
        return { success: false, error: { message: 'embedding failed' } } as unknown as Awaited<ReturnType<EmbeddingOperations['embedBatch']>>
      return { success: true, data: texts.map(() => [0.1, 0.2, 0.3]) } as unknown as Awaited<ReturnType<EmbeddingOperations['embedBatch']>>
    }) as unknown as EmbeddingOperations['embedBatch']

    const ops = createKnowledgeOperations(
      DEFAULT_CONFIG,
      createMockLLM(),
      embedding,
      createMockDatapipe(),
      store,
    )
    await ops.setup()

    const inputs = [
      { documentId: 'doc-fail', content: 'This will fail' },
      { documentId: 'doc-ok', content: 'This will succeed' },
    ]

    const result = await ops.ingestBatch(inputs)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.successCount).toBe(1)
      expect(result.data.failureCount).toBe(1)
      expect(result.data.results).toHaveLength(2)
      // 第一个应有 error，第二个应有 result
      expect(result.data.results[0].error).toBeDefined()
      expect(result.data.results[1].result).toBeDefined()
    }
  })

  it('空输入 — 返回零结果', async () => {
    const { store } = createMockKnowledgeStore()
    const ops = createKnowledgeOperations(
      DEFAULT_CONFIG,
      createMockLLM(),
      createMockEmbedding(),
      createMockDatapipe(),
      store,
    )
    await ops.setup()

    const result = await ops.ingestBatch([])
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.successCount).toBe(0)
      expect(result.data.failureCount).toBe(0)
      expect(result.data.results).toHaveLength(0)
    }
  })
})
