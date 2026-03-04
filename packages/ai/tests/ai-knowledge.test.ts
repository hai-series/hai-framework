/**
 * AI Knowledge 子模块功能测试
 *
 * 覆盖 setup / ingest / retrieve / ask / findByEntity / listEntities。
 * 使用 mock vecdb、reldb、datapipe、llm、embedding。
 */

import type { Result } from '@h-ai/core'
import type { EmbeddingOperations } from '../src/embedding/ai-embedding-types.js'
import type { LLMOperations } from '../src/llm/ai-llm-types.js'
import { describe, expect, it, vi } from 'vitest'
import { AIErrorCode } from '../src/ai-config.js'
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

function createMockVecdb() {
  const stored: Array<{ id: string, vector: number[], content?: string, metadata?: Record<string, unknown> }> = []
  const collections = new Set<string>()

  return {
    collection: {
      create: vi.fn(async (name: string) => {
        collections.add(name)
        return { success: true, data: undefined } as any
      }),
      exists: vi.fn(async (name: string) => ({
        success: true,
        data: collections.has(name),
      })) as any,
    },
    vector: {
      upsert: vi.fn(async (_collection: string, docs: typeof stored) => {
        stored.push(...docs)
        return { success: true, data: undefined } as any
      }),
      search: vi.fn(async (_collection: string, _vector: number[], options?: { topK?: number }) => {
        // 返回 stored 中的前 topK 条
        const topK = options?.topK ?? 10
        const results = stored.slice(0, topK).map((doc, i) => ({
          id: doc.id,
          score: 0.95 - i * 0.05,
          content: doc.content,
          metadata: doc.metadata,
        }))
        return { success: true, data: results } as any
      }),
    },
    _stored: stored,
    _collections: collections,
  }
}

function createMockReldb() {
  const executeCalls: Array<{ sql: string, params?: unknown[] }> = []
  const queryCalls: Array<{ sql: string, params?: unknown[] }> = []

  return {
    execute: vi.fn(async (sql: string, params?: unknown[]): Promise<Result<unknown, unknown>> => {
      executeCalls.push({ sql, params })
      return { success: true, data: { lastInsertRowid: 1, changes: 1 } } as any
    }),
    query: vi.fn(async <T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<Result<T[], unknown>> => {
      queryCalls.push({ sql, params })
      return { success: true, data: [] as T[] } as any
    }),
    _executeCalls: executeCalls,
    _queryCalls: queryCalls,
  }
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
  collection: 'knowledge',
  dimension: 3,
  enableEntityExtraction: false,
  chunkMode: 'markdown' as const,
  chunkMaxSize: 1500,
  chunkOverlap: 200,
  entityBoostWeight: 0.15,
}

// ─── setup ───

describe('knowledge setup', () => {
  it('正常初始化：创建集合 + schema', async () => {
    const vecdb = createMockVecdb()
    const reldb = createMockReldb()

    const ops = createKnowledgeOperations(
      DEFAULT_CONFIG,
      createMockLLM(),
      createMockEmbedding(),
      async () => vecdb,
      async () => reldb,
      async () => null,
    )

    const result = await ops.setup()
    expect(result.success).toBe(true)

    // 应创建集合
    expect(vecdb.collection.create).toHaveBeenCalledWith('knowledge', { dimension: 3 })
    // 应创建 schema（execute 调用 DDL）
    expect(reldb._executeCalls.length).toBeGreaterThan(0)
  })

  it('vecdb 不可用返回错误', async () => {
    const ops = createKnowledgeOperations(
      DEFAULT_CONFIG,
      createMockLLM(),
      createMockEmbedding(),
      async () => null,
      async () => null,
      async () => null,
    )

    const result = await ops.setup()
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AIErrorCode.KNOWLEDGE_SETUP_FAILED)
    }
  })

  it('自定义 collection 和 dimension', async () => {
    const vecdb = createMockVecdb()
    const reldb = createMockReldb()

    const ops = createKnowledgeOperations(
      DEFAULT_CONFIG,
      createMockLLM(),
      createMockEmbedding(),
      async () => vecdb,
      async () => reldb,
      async () => null,
    )

    const result = await ops.setup({ collection: 'custom-kb', dimension: 768 })
    expect(result.success).toBe(true)
    expect(vecdb.collection.create).toHaveBeenCalledWith('custom-kb', { dimension: 768 })
  })

  it('reldb 不可用时仍可完成 setup（仅警告）', async () => {
    const vecdb = createMockVecdb()

    const ops = createKnowledgeOperations(
      DEFAULT_CONFIG,
      createMockLLM(),
      createMockEmbedding(),
      async () => vecdb,
      async () => null,
      async () => null,
    )

    const result = await ops.setup()
    expect(result.success).toBe(true)
  })

  it('集合已存在时不重复创建', async () => {
    const vecdb = createMockVecdb()
    vecdb._collections.add('knowledge')

    const ops = createKnowledgeOperations(
      DEFAULT_CONFIG,
      createMockLLM(),
      createMockEmbedding(),
      async () => vecdb,
      async () => createMockReldb(),
      async () => null,
    )

    const result = await ops.setup()
    expect(result.success).toBe(true)
    expect(vecdb.collection.create).not.toHaveBeenCalled()
  })
})

// ─── ingest ───

describe('knowledge ingest', () => {
  async function setupOps(options?: {
    enableEntityExtraction?: boolean
    entityJson?: string
    datapipe?: ReturnType<typeof createMockDatapipe> | null
    reldb?: ReturnType<typeof createMockReldb> | null
  }) {
    const vecdb = createMockVecdb()
    const reldb = options?.reldb !== undefined ? options.reldb : createMockReldb()
    const datapipe = options?.datapipe !== undefined ? options.datapipe : createMockDatapipe()
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
      async () => vecdb,
      async () => reldb,
      async () => datapipe,
    )

    // 先 setup
    await ops.setup()

    return { ops, vecdb, reldb, datapipe, embedding, llm }
  }

  it('未 setup 时 ingest 返回错误', async () => {
    const ops = createKnowledgeOperations(
      DEFAULT_CONFIG,
      createMockLLM(),
      createMockEmbedding(),
      async () => createMockVecdb(),
      async () => null,
      async () => null,
    )

    const result = await ops.ingest({ documentId: 'doc-1', content: 'Hello world' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AIErrorCode.KNOWLEDGE_NOT_SETUP)
    }
  })

  it('正常导入：清洗 → 分块 → 向量化 → 存入 vecdb', async () => {
    const { ops, vecdb, datapipe, embedding } = await setupOps()

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
    // vecdb.upsert 应被调用
    expect(vecdb.vector.upsert).toHaveBeenCalledWith('knowledge', expect.any(Array))
  })

  it('无 datapipe 时整个文本作为单一 chunk', async () => {
    const { ops, vecdb: _vecdb } = await setupOps({ datapipe: null })

    const result = await ops.ingest({
      documentId: 'doc-2',
      content: 'Short text.',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.chunkCount).toBe(1)
    }
  })

  it('开启实体提取时提取并存储实体', async () => {
    const entityJson = JSON.stringify([
      { name: 'Alice', type: 'person', description: 'A researcher' },
    ])

    const { ops } = await setupOps({
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
  })

  it('vecdb 不可用时 ingest 返回错误', async () => {
    // 创建一个在 setup 时可用，ingest 时不可用的 vecdb
    const setupVecdb = createMockVecdb()
    let setupDone = false

    const ops = createKnowledgeOperations(
      DEFAULT_CONFIG,
      createMockLLM(),
      createMockEmbedding(),
      async () => {
        if (!setupDone)
          return setupVecdb
        return null // ingest 时返回 null
      },
      async () => createMockReldb(),
      async () => null,
    )

    await ops.setup()
    setupDone = true

    const result = await ops.ingest({ documentId: 'doc-4', content: 'Test' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AIErrorCode.KNOWLEDGE_INGEST_FAILED)
    }
  })
})

// ─── retrieve ───

describe('knowledge retrieve', () => {
  async function setupWithData() {
    const vecdb = createMockVecdb()
    const reldb = createMockReldb()
    const datapipe = createMockDatapipe()
    const embedding = createMockEmbedding()
    const llm = createMockLLM('[]')

    const ops = createKnowledgeOperations(
      DEFAULT_CONFIG,
      llm,
      embedding,
      async () => vecdb,
      async () => reldb,
      async () => datapipe,
    )

    await ops.setup()

    // 导入一个文档，让 vecdb 有内容
    await ops.ingest({
      documentId: 'doc-1',
      content: 'Artificial intelligence is transforming the world of technology.',
      title: 'AI Overview',
      url: 'https://example.com/ai',
    })

    return { ops, vecdb, reldb, embedding }
  }

  it('未 setup 时返回错误', async () => {
    const ops = createKnowledgeOperations(
      DEFAULT_CONFIG,
      createMockLLM(),
      createMockEmbedding(),
      async () => createMockVecdb(),
      async () => null,
      async () => null,
    )

    const result = await ops.retrieve('test query')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AIErrorCode.KNOWLEDGE_NOT_SETUP)
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
        expect(item.citation.collection).toBe('knowledge')
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
    const vecdb = createMockVecdb()
    const reldb = createMockReldb()
    const datapipe = createMockDatapipe()
    const embedding = createMockEmbedding()
    const llm = createMockLLM('[]')

    const ops = createKnowledgeOperations(
      DEFAULT_CONFIG,
      llm,
      embedding,
      async () => vecdb,
      async () => reldb,
      async () => datapipe,
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
  it('findByEntity — reldb 不可用返回错误', async () => {
    const ops = createKnowledgeOperations(
      DEFAULT_CONFIG,
      createMockLLM(),
      createMockEmbedding(),
      async () => createMockVecdb(),
      async () => null,
      async () => null,
    )

    const result = await ops.findByEntity('Alice')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AIErrorCode.KNOWLEDGE_RETRIEVE_FAILED)
    }
  })

  it('listEntities — reldb 不可用返回错误', async () => {
    const ops = createKnowledgeOperations(
      DEFAULT_CONFIG,
      createMockLLM(),
      createMockEmbedding(),
      async () => createMockVecdb(),
      async () => null,
      async () => null,
    )

    const result = await ops.listEntities()
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AIErrorCode.KNOWLEDGE_RETRIEVE_FAILED)
    }
  })

  it('findByEntity — 正常返回（空结果）', async () => {
    const reldb = createMockReldb()
    const ops = createKnowledgeOperations(
      DEFAULT_CONFIG,
      createMockLLM(),
      createMockEmbedding(),
      async () => createMockVecdb(),
      async () => reldb,
      async () => null,
    )

    const result = await ops.findByEntity('Alice')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual([])
    }
  })

  it('listEntities — 正常返回（空结果）', async () => {
    const reldb = createMockReldb()
    const ops = createKnowledgeOperations(
      DEFAULT_CONFIG,
      createMockLLM(),
      createMockEmbedding(),
      async () => createMockVecdb(),
      async () => reldb,
      async () => null,
    )

    const result = await ops.listEntities()
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual([])
    }
  })

  it('listEntities — 传递过滤参数', async () => {
    const reldb = createMockReldb()
    const ops = createKnowledgeOperations(
      DEFAULT_CONFIG,
      createMockLLM(),
      createMockEmbedding(),
      async () => createMockVecdb(),
      async () => reldb,
      async () => null,
    )

    const result = await ops.listEntities({ type: 'person', keyword: 'Alice', limit: 5 })
    expect(result.success).toBe(true)

    // 验证 query 被正确调用
    expect(reldb._queryCalls.length).toBeGreaterThan(0)
    const lastCall = reldb._queryCalls[reldb._queryCalls.length - 1]
    expect(lastCall.sql).toContain('type = ?')
    expect(lastCall.sql).toContain('LIKE')
    expect(lastCall.sql).toContain('LIMIT')
  })
})
