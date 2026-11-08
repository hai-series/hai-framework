/** Mem0 数据格式 Provider：公开功能、主体隔离、受限回退与安全失败。 */
import type { HaiResult } from '@h-ai/core'
import type { EmbeddingOperations } from '../src/embedding/ai-embedding-types.js'
import type { LLMOperations } from '../src/llm/ai-llm-types.js'
import { err, ok } from '@h-ai/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryConfigSchema } from '../src/ai-config.js'
import { HaiAIError } from '../src/ai-types.js'
import { createMemoryOperations } from '../src/memory/ai-memory-facade.js'
import { createMem0MemoryOperations } from '../src/memory/providers/ai-memory-provider-mem0.js'

function value<T>(result: HaiResult<T>): T {
  if (!result.success)
    throw new Error(result.error.message)
  return result.data
}

const embedding: EmbeddingOperations = {
  embedText: async () => ok([0.1, 0.2, 0.3]),
  embedBatch: async texts => ok(texts.map(() => [0.1, 0.2, 0.3])),
  embed: async () => { throw new Error('Unused low-level operation') },
}

function createLlmMock(content: string): LLMOperations {
  return {
    chat: vi.fn(async () => ({
      success: true as const,
      data: {
        id: 't',
        object: 'chat.completion' as const,
        created: Date.now(),
        model: 'test-model',
        choices: [
          {
            index: 0,
            message: { role: 'assistant' as const, content, refusal: null },
            logprobs: null,
            finish_reason: 'stop' as const,
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      },
    })),
    async* chatStream() {},
    listModels: async () => ok([]),
    getHistory: async () => ok([]),
    listSessions: async () => ok([]),
    ask: async () => ok(content),
    async* askStream() {},
    generateObject: async () => err(HaiAIError.INVALID_REQUEST, 'Unsupported in extraction fixture'),
  }
}

async function createOps(options: { fallback?: boolean, backend?: { type: string, url?: string }, embedder?: EmbeddingOperations, llm?: LLMOperations } = {}) {
  return createMemoryOperations(await createMem0MemoryOperations({
    config: MemoryConfigSchema.parse({ provider: 'mem0', allowEphemeralFallback: options.fallback ?? false }),
    embedding: options.embedder ?? embedding,
    llm: options.llm ?? createLlmMock('[]'),
    collectionName: 'hai_ai_memory',
    embeddingDims: 3,
    vectorBackend: options.backend,
  }))
}

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('HAI_CORE_ENV', 'development')
  vi.stubEnv('HAI_E2E', '0')
  vi.stubEnv('HAI_E2E_MOCK', '0')
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('mem0 format provider', () => {
  it.each(['NODE_ENV', 'HAI_CORE_ENV'])('生产 %s 禁止无后端及临时回退', async (key) => {
    vi.stubEnv(key, 'production')
    for (const backend of [
      undefined,
      { type: 'chroma', url: 'https://unused.example' },
    ])
      await expect(createOps({ fallback: true, backend })).rejects.toMatchObject({ code: HaiAIError.CONFIGURATION_ERROR.code })
  })

  it.each([
    { type: 'qdrant' },
    { type: 'qdrant', url: 'file:///tmp/db' },
    { type: 'pgvector' },
    { type: 'lancedb' },
  ])('拒绝未支持或无效后端 $type', async (backend) => {
    await expect(createOps({ backend })).rejects.toMatchObject({ code: HaiAIError.CONFIGURATION_ERROR.code })
  })

  it('显式开发回退使用实际临时存储，重建实例不冒充持久化', async () => {
    const options = {
      fallback: true,
      backend: { type: 'chroma' },
    }
    const first = await createOps(options)
    value(await first.add({ objectId: 'alice', content: 'temporary', type: 'fact' }))
    const second = await createOps(options)
    expect(value(await second.list({ objectId: 'alice' }))).toEqual([])
  })

  it('写后读取、原地修改、过滤列表和跨主体拒绝保留完整业务字段', async () => {
    const memory = await createOps()
    const alice = memory.scoped({
      objectId: 'alice',
      scope: { tenant: 'A' },
    })
    const bob = memory.scoped({
      objectId: 'bob',
      scope: { tenant: 'B' },
    })
    const entry = value(await alice.add({
      content: 'Alice speaks Chinese',
      type: 'fact',
      metadata: { source: 'manual' },
    }))
    expect(value(await alice.get(entry.id))).toMatchObject({
      objectId: 'alice',
      metadata: { source: 'manual' },
      scope: { tenant: 'A' },
    })
    for (const result of [await bob.get(entry.id), await bob.update(entry.id, { content: 'forged' }), await bob.remove(entry.id)]) {
      expect(result).toMatchObject({
        success: false,
        error: { code: HaiAIError.MEMORY_NOT_FOUND.code },
      })
    }
    const updated = value(await alice.update(entry.id, { content: 'Alice prefers Chinese', type: 'preference', importance: 0.9 }))
    expect(updated).toMatchObject({
      id: entry.id,
      createdAt: entry.createdAt,
      type: 'preference',
      importance: 0.9,
      content: 'Alice prefers Chinese',
      metadata: { source: 'manual' },
      scope: { tenant: 'A' },
    })
    value(await bob.add({ content: 'Bob speaks French', type: 'fact' }))
    expect(value(await alice.listPage({
      types: ['preference'],
    }))).toMatchObject({
      total: 1,
      items: [
        { id: entry.id },
      ],
    })
    expect(value(await bob.list())).toHaveLength(1)
    value(await alice.remove(entry.id))
    expect((await alice.get(entry.id)).success).toBe(false)
    expect(value(await bob.list())).toHaveLength(1)
  })

  it('召回按主体、类型、scope和importance过滤，条件清理不触碰其他条目', async () => {
    const memory = await createOps()
    for (const entry of [
      {
        objectId: 'alice',
        type: 'fact' as const,
        content: 'A',
        scope: { topic: 'A' },
        importance: 0.9,
      },
      {
        objectId: 'alice',
        type: 'event' as const,
        content: 'B',
        scope: { topic: 'B' },
        importance: 0.3,
      },
      {
        objectId: 'bob',
        type: 'fact' as const,
        content: 'C',
        scope: { topic: 'A' },
        importance: 1,
      },
    ]) value(await memory.add(entry))
    expect(value(await memory.recall('topic', {
      objectId: 'alice',
      types: ['fact'],
      scope: { topic: 'A' },
      minImportance: 0.8,
    })).map(entry => entry.content)).toEqual(['A'])
    value(await memory.clear({
      objectId: 'alice',
      types: ['fact'],
    }))
    expect(value(await memory.list({ objectId: 'alice' })).map(entry => entry.content)).toEqual(['B'])
    expect(value(await memory.list({ objectId: 'bob' }))).toHaveLength(1)
    expect((await memory.clear()).success).toBe(false)
    value(await memory.admin.clearAll({ confirm: true }))
    expect(value(await memory.list({ objectId: 'bob' }))).toEqual([])
  })

  it('框架提取分类后直接写入格式存储，无额外推理客户端', async () => {
    const memory = await createOps({
      llm: createLlmMock(JSON.stringify([
        { content: '用户喜欢中文', type: 'preference', importance: 0.9 },
      ])),
    })
    const result = value(await memory.extract([
      { role: 'user', content: '我喜欢中文' },
    ], {
      objectId: 'alice',
      scope: { topic: 'language' },
    }))
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      objectId: 'alice',
      type: 'preference',
      scope: { topic: 'language' },
    })
  })

  it('嵌入异常不越过HaiResult，不向前端返回私有诊断或cause', async () => {
    const memory = await createOps({
      embedder: {
        ...embedding,
        embedText: async () => { throw new Error('private-api-key-diagnostic') },
      },
    })
    const result = await memory.add({ objectId: 'alice', content: 'test', type: 'fact' })
    expect(result.success).toBe(false)
    expect(JSON.stringify(result)).not.toContain('private-api-key-diagnostic')
    if (!result.success) {
      expect(result.error.cause).toBeUndefined()
      expect(result.error.ext).toEqual({ requiresEffectReconciliation: true, memoryIds: [] })
    }
  })

  it('真实后端未就绪时init失败，不发布临时存储或半就绪实例', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('backend unavailable')))
    await expect(createOps({
      backend: { type: 'qdrant', url: 'https://unused.example' },
    })).rejects.toMatchObject({ code: HaiAIError.CONFIGURATION_ERROR.code })
  })
  it.each(['remove', 'clear'] as const)('迟到update不复活已%s的条目', async (operation) => {
    let release!: () => void
    let entered!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const waiting = new Promise<void>((resolve) => {
      entered = resolve
    })
    const memory = await createOps({
      embedder: {
        ...embedding,
        embedText: async (text) => {
          if (text === 'late content') {
            entered()
            await gate
          }
          return ok([0.1, 0.2, 0.3])
        },
      },
    })
    const entry = value(await memory.add({ objectId: 'alice', content: 'original', type: 'fact' }))
    const update = memory.update(entry.id, {
      content: 'late content',
      metadata: { hai_revision: 'forged', user_id: 'bob' },
    }, { objectId: 'alice' })
    await waiting
    try {
      value(operation === 'remove'
        ? await memory.remove(entry.id, { objectId: 'alice' })
        : await memory.clear({ objectId: 'alice' }))
      expect((await memory.get(entry.id, { objectId: 'alice' })).success).toBe(false)
    }
    finally { release() }
    expect((await update).success).toBe(false)
    expect((await memory.get(entry.id, { objectId: 'alice' })).success).toBe(false)
  })
})
