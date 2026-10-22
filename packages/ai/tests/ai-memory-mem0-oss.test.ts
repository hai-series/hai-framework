/**
 * Mem0 OSS Memory Provider 单元测试
 *
 * 通过 mock `mem0ai/oss` 验证配置映射（LLM / Embedder / VectorStore）与操作转换，
 * 不加载真实 mem0 引擎。
 */

import type { LLMOperations } from '../src/llm/ai-llm-types.js'

import { err, ok } from '@h-ai/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AIConfigSchema, MemoryConfigSchema } from '../src/ai-config.js'

import { HaiAIError } from '../src/ai-types.js'
import { createMem0OssMemoryOperations } from '../src/memory/providers/ai-memory-provider-mem0-oss.js'

const memoryMock = vi.hoisted(() => ({
  add: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  search: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  get: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  getAll: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  update: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  delete: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  deleteAll: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  reset: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}))
const memoryCtorMock = vi.hoisted(() => vi.fn())
const qdrantClientMock = vi.hoisted(() => ({ prototype: { search: undefined as (() => void) | undefined } }))

vi.mock('@qdrant/js-client-rest', () => ({ QdrantClient: qdrantClientMock }))

vi.mock('mem0ai/oss', () => {
  class Memory {
    constructor(config: unknown) {
      memoryCtorMock(config)
      return memoryMock as unknown as Memory
    }
  }
  return { Memory }
})

const aiConfig = AIConfigSchema.parse({ llm: { apiKey: 'sk-test', model: 'gpt-4o-mini', baseUrl: 'https://api.example.com/v1' } })
const memoryConfig = MemoryConfigSchema.parse({ provider: 'mem0' })

/** 构造返回固定 chat 内容的 LLM mock（供框架层记忆提取器使用） */
function createLlmMock(content: string): LLMOperations {
  return {
    chat: vi.fn(async () => ({
      success: true as const,
      data: {
        id: 't',
        object: 'chat.completion' as const,
        created: Date.now(),
        model: 'test-model',
        choices: [{ index: 0, message: { role: 'assistant' as const, content, refusal: null }, logprobs: null, finish_reason: 'stop' as const }],
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

function createOps(vectorBackend?: { type: string, url?: string, apiKey?: string }, llm?: LLMOperations) {
  return createMem0OssMemoryOperations({
    config: memoryConfig,
    aiConfig,
    llm: llm ?? createLlmMock('[]'),
    collectionName: 'hai_ai_memory',
    embeddingDims: 1536,
    vectorBackend,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  qdrantClientMock.prototype.search = () => {}
  memoryMock.add.mockResolvedValue({ results: [] })
  memoryMock.search.mockResolvedValue({ results: [] })
  memoryMock.getAll.mockResolvedValue({ results: [] })
  memoryMock.get.mockResolvedValue(null)
  memoryMock.update.mockResolvedValue({ message: 'ok' })
  memoryMock.delete.mockResolvedValue({ message: 'ok' })
  memoryMock.deleteAll.mockResolvedValue({ message: 'ok' })
  memoryMock.reset.mockResolvedValue(undefined)
})

describe('production Mem0 state', () => {
  afterEach(() => vi.unstubAllEnvs())

  function environment(nodeEnv: string, coreEnv: string) {
    vi.stubEnv('NODE_ENV', nodeEnv)
    vi.stubEnv('HAI_CORE_ENV', coreEnv)
    vi.stubEnv('HAI_E2E', '0')
    vi.stubEnv('HAI_E2E_MOCK', '0')
  }

  const environments = [
    { node: 'production', core: 'development' },
    { node: 'test', core: 'production' },
  ]
  for (const env of environments) {
    it.each([
      { name: 'remote Chroma with fallback', backend: { type: 'chroma', url: 'https://chroma.example.invalid' } },
      { name: 'no vector backend', backend: undefined },
    ])(`rejects $name before constructing SDK (${env.node}/${env.core})`, async ({ backend }) => {
      environment(env.node, env.core)
      await expect(createMem0OssMemoryOperations({
        config: MemoryConfigSchema.parse({ provider: 'mem0', allowEphemeralFallback: true }),
        aiConfig,
        llm: createLlmMock('[]'),
        collectionName: 'hai_ai_memory',
        embeddingDims: 3,
        vectorBackend: backend,
      })).rejects.toMatchObject({ code: HaiAIError.CONFIGURATION_ERROR.code })
      expect(memoryCtorMock).not.toHaveBeenCalled()
    })
  }

  it.each([{ type: 'qdrant' }, { type: 'qdrant', url: 'file:///tmp/vector' }, { type: 'pgvector' }, { type: 'pgvector', connectionString: 'invalid' }])('rejects incomplete $type connection before SDK construction', async (backend) => {
    environment('production', 'production')
    await expect(createOps(backend)).rejects.toMatchObject({ code: HaiAIError.CONFIGURATION_ERROR.code })
    expect(memoryCtorMock).not.toHaveBeenCalled()
  })

  it.each([
    { type: 'qdrant', url: 'https://qdrant.example.invalid:6333', apiKey: 'test-key' },
  ])('accepts actual supported $type mapping in production', async (backend) => {
    environment('production', 'production')
    await createMem0OssMemoryOperations({
      config: MemoryConfigSchema.parse({ provider: 'mem0', allowEphemeralFallback: true }),
      aiConfig,
      llm: createLlmMock('[]'),
      collectionName: 'hai_ai_memory',
      embeddingDims: 3,
      vectorBackend: backend,
    })
    expect(memoryCtorMock).toHaveBeenCalledOnce()
    expect(memoryCtorMock).toHaveBeenCalledWith(expect.objectContaining({
      vectorStore: expect.objectContaining({ provider: backend.type }),
    }))
  })

  it.each(['development', 'production'])('rejects unmanaged Mem0 PG connection lifecycle in %s, even with fallback allowed', async (mode) => {
    environment(mode, mode)
    await expect(createMem0OssMemoryOperations({
      config: MemoryConfigSchema.parse({ provider: 'mem0', allowEphemeralFallback: true }),
      aiConfig,
      llm: createLlmMock('[]'),
      collectionName: 'hai_ai_memory',
      vectorBackend: { type: 'pgvector', connectionString: 'postgresql://user:password@vector.example.invalid/vectors' },
    })).rejects.toMatchObject({ code: HaiAIError.CONFIGURATION_ERROR.code })
    expect(memoryCtorMock).not.toHaveBeenCalled()
  })

  it.each(['development', 'HAI_E2E', 'HAI_E2E_MOCK'])('allows explicit ephemeral fallback only for %s', async (mode) => {
    environment(mode === 'development' ? 'development' : 'production', 'development')
    if (mode !== 'development')
      vi.stubEnv(mode, '1')
    await createMem0OssMemoryOperations({
      config: MemoryConfigSchema.parse({ provider: 'mem0', allowEphemeralFallback: true }),
      aiConfig,
      llm: createLlmMock('[]'),
      collectionName: 'hai_ai_memory',
      embeddingDims: 3,
      vectorBackend: { type: 'chroma', url: 'https://chroma.example.invalid' },
    })
    expect(memoryCtorMock).toHaveBeenCalledWith(expect.objectContaining({
      vectorStore: expect.objectContaining({ provider: 'memory' }),
    }))
  })
})

describe('createMem0OssMemoryOperations', () => {
  it('waits for actual SDK readiness and propagates backend initialization failure', async () => {
    memoryMock.getAll.mockRejectedValueOnce(new Error('backend unavailable'))
    await expect(createOps()).rejects.toThrow('backend unavailable')
    expect(memoryMock.getAll).toHaveBeenCalledWith({ filters: { user_id: 'hai-global' }, topK: 1, showExpired: true })
  })

  it('rejects incompatible Qdrant peer before constructing Mem0', async () => {
    qdrantClientMock.prototype.search = undefined
    await expect(createOps({ type: 'qdrant', url: 'http://localhost:6333' })).rejects.toMatchObject({ code: HaiAIError.CONFIGURATION_ERROR.code })
    expect(memoryCtorMock).not.toHaveBeenCalled()
  })
  it('从 AIConfig 提取 openai LLM / Embedder 配置', async () => {
    await createOps()

    const config = memoryCtorMock.mock.calls[0]?.[0] as {
      llm: { provider: string, config: Record<string, unknown> }
      embedder: { provider: string, config: Record<string, unknown> }
      disableHistory?: boolean
    }
    expect(config.llm.provider).toBe('openai')
    expect(config.llm.config.apiKey).toBe('sk-test')
    expect(config.llm.config.baseURL).toBe('https://api.example.com/v1')
    expect(config.embedder.provider).toBe('openai')
    expect(config.embedder.config.embeddingDims).toBe(1536)
    expect(config.disableHistory).toBe(true)
  })

  it('无后端时向量库退回 mem0 自带 memory 存储', async () => {
    await createOps()
    const config = memoryCtorMock.mock.calls[0]?.[0] as { vectorStore: { provider: string } }
    expect(config.vectorStore.provider).toBe('memory')
  })

  it('qdrant 后端映射为 mem0 qdrant 向量库', async () => {
    await createOps({ type: 'qdrant', url: 'http://localhost:6333', apiKey: 'qk' })
    const config = memoryCtorMock.mock.calls[0]?.[0] as { vectorStore: { provider: string, config: Record<string, unknown> } }
    expect(config.vectorStore.provider).toBe('qdrant')
    expect(config.vectorStore.config.url).toBe('http://localhost:6333')
    expect(config.vectorStore.config.apiKey).toBe('qk')
    expect(config.vectorStore.config.collectionName).toBe('hai_ai_memory')
  })

  it('配置了不支持的持久化后端（lancedb）默认 fail-fast（issue #6.1）', async () => {
    // allowEphemeralFallback 默认 false：mem0 无法映射 lancedb 时初始化失败，避免记忆静默丢失
    await expect(createOps({ type: 'lancedb', url: 'file://./data' })).rejects.toBeDefined()
  })

  it('显式 allowEphemeralFallback=true 时不支持的后端退回内存存储（issue #6.1）', async () => {
    const config = MemoryConfigSchema.parse({ provider: 'mem0', allowEphemeralFallback: true })
    const ops = await createMem0OssMemoryOperations({
      config,
      aiConfig,
      llm: createLlmMock('[]'),
      collectionName: 'hai_ai_memory',
      embeddingDims: 1536,
      vectorBackend: { type: 'chroma', url: 'http://localhost:8000' },
    })
    expect(ops).toBeDefined()
    const ctorConfig = memoryCtorMock.mock.calls[0]?.[0] as { vectorStore: { provider: string } }
    expect(ctorConfig.vectorStore.provider).toBe('memory')
  })

  it('list 在 types / scope 过滤之后再应用 limit（issue #6.2：不再漏返回）', async () => {
    // getAll 若被传入 topK 则按 topK 截断（模拟后端 limit 语义）
    const all = [
      { id: 'f1', memory: '事实1', metadata: { hai_object_id: 'u1', hai_type: 'fact' } },
      { id: 'f2', memory: '事实2', metadata: { hai_object_id: 'u1', hai_type: 'fact' } },
      { id: 'f3', memory: '事实3', metadata: { hai_object_id: 'u1', hai_type: 'fact' } },
      { id: 'p1', memory: '偏好1', metadata: { hai_object_id: 'u1', hai_type: 'preference' } },
      { id: 'p2', memory: '偏好2', metadata: { hai_object_id: 'u1', hai_type: 'preference' } },
    ]
    memoryMock.getAll.mockImplementation(async (opts: unknown) => {
      const topK = typeof opts === 'object' && opts !== null && 'topK' in opts && typeof opts.topK === 'number' ? opts.topK : 20
      return { results: all.slice(0, topK) }
    })

    const ops = await createOps()
    const result = await ops.list({ objectId: 'u1', types: ['preference'], limit: 2 })
    expect(result.success).toBe(true)
    if (!result.success)
      return
    // 修复前：getAll(topK=2) 只取回前 2 条（都是 fact），过滤 preference → 0 条（漏返回）
    // 修复后：完整取回后过滤 preference → 2 条，再截 limit
    expect(result.data).toHaveLength(2)
    expect(result.data.map(e => e.type)).toEqual(['preference', 'preference'])
    // SDK 默认为 20；固定多取一条用于完整性探测，不能省略 topK。
    expect(memoryMock.getAll).toHaveBeenCalledWith({ filters: { user_id: 'u1' }, topK: 1001, showExpired: true })
  })

  it('extract 用框架提取器分类后以 infer:false 写入并保留 hai_type/hai_importance', async () => {
    const llm = createLlmMock(JSON.stringify([{ content: '用户喜欢中文', type: 'preference', importance: 0.8 }]))
    memoryMock.add.mockResolvedValue({ results: [{ id: 'm1', memory: '用户喜欢中文', metadata: { event: 'ADD' } }] })
    memoryMock.get.mockResolvedValue({ id: 'm1', memory: '用户喜欢中文', metadata: { hai_type: 'preference', hai_importance: 0.8 } })
    const ops = await createOps(undefined, llm)

    const result = await ops.extract([{ role: 'user', content: '我喜欢中文' }], { objectId: 'u1' })
    expect(result.success).toBe(true)
    if (!result.success)
      return
    expect(result.data).toHaveLength(1)
    expect(result.data[0].content).toBe('用户喜欢中文')
    expect(result.data[0].type).toBe('preference')
    expect(result.data[0].importance).toBe(0.8)
    // 以 infer:false 写入，并带上 hai_type / hai_importance 元数据（与 native 语义一致）
    expect(memoryMock.add).toHaveBeenCalledWith(
      [{ role: 'user', content: '用户喜欢中文' }],
      expect.objectContaining({
        userId: 'u1',
        infer: false,
        metadata: expect.objectContaining({ hai_type: 'preference', hai_importance: 0.8 }),
      }),
    )
  })

  it('recall 按 types 过滤', async () => {
    memoryMock.search.mockResolvedValue({ results: [
      { id: 'm1', memory: '事实', metadata: { hai_type: 'fact', hai_importance: 0.8 } },
      { id: 'm2', memory: '偏好', metadata: { hai_type: 'preference', hai_importance: 0.8 } },
    ] })
    const ops = await createOps()

    const result = await ops.recall('q', { objectId: 'u1', types: ['preference'] })
    expect(result.success).toBe(true)
    if (!result.success)
      return
    expect(result.data).toHaveLength(1)
    expect(result.data[0].content).toBe('偏好')
  })

  it('recall 调用 mem0.search 并按 importance 过滤', async () => {
    memoryMock.search.mockResolvedValue({ results: [
      { id: 'm1', memory: '高', score: 0.9, metadata: { hai_importance: 0.8 } },
      { id: 'm2', memory: '低', score: 0.5, metadata: { hai_importance: 0.1 } },
    ] })
    const ops = await createOps()

    const result = await ops.recall('q', { objectId: 'u1', minImportance: 0.5 })
    expect(result.success).toBe(true)
    if (!result.success)
      return
    expect(result.data).toHaveLength(1)
    expect(result.data[0].content).toBe('高')
  })

  it('add 调用 mem0.add(infer: false) 并保留 hai 字段', async () => {
    memoryMock.add.mockResolvedValue({ results: [{ id: 'm2', memory: '手动记忆', metadata: { event: 'ADD' } }] })
    memoryMock.get.mockResolvedValue({ id: 'm2', memory: '手动记忆', createdAt: '2024-01-01T00:00:00.000Z', metadata: { hai_type: 'fact', hai_importance: 0.7 } })
    const ops = await createOps()

    const result = await ops.add({ content: '手动记忆', type: 'fact', importance: 0.7, objectId: 'u1' })
    expect(result.success).toBe(true)
    if (!result.success)
      return
    expect(result.data.type).toBe('fact')
    expect(result.data.importance).toBe(0.7)
    expect(result.data.createdAt).toBe(Date.parse('2024-01-01T00:00:00.000Z'))
    expect(memoryMock.add).toHaveBeenCalledWith(
      [{ role: 'user', content: '手动记忆' }],
      expect.objectContaining({ infer: false }),
    )
  })

  it('get 命中返回条目，未命中返回 MEMORY_NOT_FOUND', async () => {
    const ops = await createOps()

    memoryMock.get.mockResolvedValueOnce({ id: 'm1', memory: 'x', metadata: {} })
    const hit = await ops.get('m1')
    expect(hit.success && hit.data.id).toBe('m1')

    memoryMock.get.mockResolvedValueOnce(null)
    const miss = await ops.get('nope')
    expect(miss.success).toBe(false)
  })

  it('remove 调用 mem0.delete', async () => {
    const ops = await createOps()
    const result = await ops.remove('m1')
    expect(result.success).toBe(true)
    expect(memoryMock.delete).toHaveBeenCalledWith('m1')
  })

  it('clear 带 objectId 调用 deleteAll，不带则 reset', async () => {
    const ops = await createOps()

    await ops.clear({ objectId: 'u1' })
    expect(memoryMock.deleteAll).toHaveBeenCalledWith({ userId: 'u1' })

    await ops.clear()
    expect(memoryMock.reset).toHaveBeenCalled()
  })

  it('recall 按 scope 严格过滤（issue #6，不召回其他主题/角色）', async () => {
    memoryMock.search.mockResolvedValue({ results: [
      { id: 'a', memory: '主题A', score: 0.9, metadata: { hai_object_id: 'u1', hai_scope: { topicId: 'A' } } },
      { id: 'b', memory: '主题B', score: 0.8, metadata: { hai_object_id: 'u1', hai_scope: { topicId: 'B' } } },
      { id: 'c', memory: '无作用域', score: 0.7, metadata: { hai_object_id: 'u1' } },
    ] })
    const ops = await createOps()

    const result = await ops.recall('q', { objectId: 'u1', scope: { topicId: 'A' } })
    expect(result.success).toBe(true)
    if (!result.success)
      return
    expect(result.data.map(e => e.content)).toEqual(['主题A'])
  })

  it('recall 兜底按 objectId 隔离（issue #10，过滤掉非归属条目）', async () => {
    memoryMock.search.mockResolvedValue({ results: [
      { id: 'a', memory: '属于 u1', score: 0.9, metadata: { hai_object_id: 'u1' } },
      { id: 'x', memory: '属于 u2', score: 0.8, metadata: { hai_object_id: 'u2' } },
    ] })
    const ops = await createOps()

    const result = await ops.recall('q', { objectId: 'u1' })
    expect(result.success && result.data.map(e => e.content)).toEqual(['属于 u1'])
  })

  it('recall 以 topK×candidateMultiplier 取回候选池，避免 scope 过滤后漏召回', async () => {
    // 模拟：向量最相关的都是主题 A/B，主题 C 的条目相关度较低排在后面。
    // 若只取 topK=2，则 C 完全落在候选池外 → scope=C 过滤后为 0 条（漏召回）。
    // 候选池放大到 topK×candidateMultiplier 后，C 的条目进入候选池 → 正确召回。
    memoryMock.search.mockResolvedValue({ results: [
      { id: 'a1', memory: 'A1', score: 0.95, metadata: { hai_object_id: 'u1', hai_scope: { topicId: 'A' } } },
      { id: 'a2', memory: 'A2', score: 0.94, metadata: { hai_object_id: 'u1', hai_scope: { topicId: 'A' } } },
      { id: 'b1', memory: 'B1', score: 0.90, metadata: { hai_object_id: 'u1', hai_scope: { topicId: 'B' } } },
      { id: 'c1', memory: 'C1', score: 0.60, metadata: { hai_object_id: 'u1', hai_scope: { topicId: 'C' } } },
      { id: 'c2', memory: 'C2', score: 0.55, metadata: { hai_object_id: 'u1', hai_scope: { topicId: 'C' } } },
    ] })
    const ops = await createOps()

    const result = await ops.recall('q', { objectId: 'u1', topK: 2, scope: { topicId: 'C' } })
    expect(result.success).toBe(true)
    if (!result.success)
      return
    // 候选池宽度 = topK×candidateMultiplier（2×5=10），C 的条目被纳入并正确召回
    expect(memoryMock.search).toHaveBeenCalledWith('q', { filters: { user_id: 'u1' }, topK: 10 })
    expect(result.data.map(e => e.content)).toEqual(['C1', 'C2'])
  })

  it('recall 显式 candidateMultiplier 覆盖配置默认值', async () => {
    memoryMock.search.mockResolvedValue({ results: [] })
    const ops = await createOps()

    await ops.recall('q', { objectId: 'u1', topK: 3, candidateMultiplier: 2 })
    expect(memoryMock.search).toHaveBeenCalledWith('q', expect.objectContaining({ topK: 6 }))
  })

  it('add 完整保留业务 metadata（issue #9）与归属主体（issue #10）', async () => {
    memoryMock.add.mockResolvedValue({ results: [{ id: 'm9', memory: '记忆', metadata: { hai_object_id: 'u1' } }] })
    const ops = await createOps()
    await ops.add({
      content: '记忆',
      type: 'event',
      importance: 0.6,
      objectId: 'u1',
      scope: { topicId: 'A', personaId: 'p1' },
      metadata: { speakerId: 's1', turnId: 't9', interrupted: true },
    })

    const [, addOptions] = memoryMock.add.mock.calls[0] as [unknown, { metadata: Record<string, unknown> }]
    expect(addOptions.metadata.hai_object_id).toBe('u1')
    expect(addOptions.metadata.hai_scope).toEqual({ topicId: 'A', personaId: 'p1' })
    expect(addOptions.metadata.hai_metadata).toEqual({ speakerId: 's1', turnId: 't9', interrupted: true })
  })

  it('get 还原准确的 objectId 与完整 metadata（issue #9/#10）', async () => {
    memoryMock.get.mockResolvedValue({
      id: 'm1',
      memory: '记忆',
      metadata: { hai_object_id: 'u7', hai_type: 'event', hai_importance: 0.6, hai_metadata: { speakerId: 's1', topicId: 'A' } },
    })
    const ops = await createOps()

    const result = await ops.get('m1')
    expect(result.success).toBe(true)
    if (!result.success)
      return
    expect(result.data.objectId).toBe('u7')
    expect(result.data.type).toBe('event')
    expect(result.data.metadata).toEqual({ speakerId: 's1', topicId: 'A' })
  })

  it('update 原地更新全部元数据，保留 ID 和创建时间', async () => {
    const createdAt = '2024-01-01T00:00:00.000Z'
    memoryMock.get.mockResolvedValueOnce({
      id: 'm1',
      memory: '旧内容',
      createdAt,
      metadata: { hai_object_id: 'u1', hai_type: 'fact', hai_importance: 0.5, hai_metadata: { a: 1 } },
    }).mockResolvedValueOnce({
      id: 'm1',
      memory: '旧内容',
      createdAt,
      metadata: { hai_object_id: 'u1', hai_type: 'preference', hai_importance: 0.9, hai_metadata: { a: 1, b: 2 } },
    })
    const ops = await createOps()
    const result = await ops.update('m1', { type: 'preference', importance: 0.9, metadata: { a: 1, b: 2 } })
    expect(result.success && result.data).toMatchObject({ id: 'm1', type: 'preference', importance: 0.9, metadata: { a: 1, b: 2 }, createdAt: Date.parse(createdAt) })
    expect(memoryMock.update).toHaveBeenCalledWith('m1', {
      metadata: { hai_object_id: 'u1', hai_type: 'preference', hai_importance: 0.9, hai_metadata: { a: 1, b: 2 } },
    })
    expect(memoryMock.delete).not.toHaveBeenCalled()
    expect(memoryMock.add).not.toHaveBeenCalled()
  })

  it('update 仅改 content 时原地更新，保持 memoryId 稳定（issue #8）', async () => {
    memoryMock.get.mockResolvedValue({ id: 'm1', memory: '新内容', metadata: { hai_object_id: 'u1', hai_type: 'fact' } })
    const ops = await createOps()

    const result = await ops.update('m1', { content: '新内容' })
    expect(result.success).toBe(true)
    expect(memoryMock.update).toHaveBeenCalledWith('m1', expect.objectContaining({ text: '新内容', metadata: expect.objectContaining({ hai_object_id: 'u1' }) }))
    expect(memoryMock.delete).not.toHaveBeenCalled()
  })

  it('clear 含 types 时逐条删除匹配项，不误删整个主体（issue #7）', async () => {
    memoryMock.getAll.mockResolvedValue({ results: [
      { id: 'e1', memory: '事件', metadata: { hai_object_id: 'u1', hai_type: 'event' } },
      { id: 'f1', memory: '事实', metadata: { hai_object_id: 'u1', hai_type: 'fact' } },
    ] })
    const ops = await createOps()

    await ops.clear({ objectId: 'u1', types: ['event'] })
    expect(memoryMock.deleteAll).not.toHaveBeenCalled()
    expect(memoryMock.reset).not.toHaveBeenCalled()
    expect(memoryMock.delete).toHaveBeenCalledTimes(1)
    expect(memoryMock.delete).toHaveBeenCalledWith('e1')
  })

  it('clear 仅含 types（无 objectId）也不触发 reset（issue #7 破坏性防护）', async () => {
    memoryMock.getAll.mockResolvedValue({ results: [
      { id: 'e1', memory: '事件', metadata: { hai_object_id: 'hai-global', hai_type: 'event' } },
    ] })
    const ops = await createOps()

    await ops.clear({ types: ['event'] })
    expect(memoryMock.reset).not.toHaveBeenCalled()
    expect(memoryMock.delete).toHaveBeenCalledWith('e1')
  })

  it('listPage 按 scope 过滤后分页（issue #11）', async () => {
    memoryMock.getAll.mockResolvedValue({ results: [
      { id: 'a', memory: '1', metadata: { hai_object_id: 'u1', hai_scope: { topicId: 'A' } } },
      { id: 'b', memory: '2', metadata: { hai_object_id: 'u1', hai_scope: { topicId: 'B' } } },
      { id: 'c', memory: '3', metadata: { hai_object_id: 'u1', hai_scope: { topicId: 'A' } } },
    ] })
    const ops = await createOps()

    const result = await ops.listPage({ objectId: 'u1', scope: { topicId: 'A' }, offset: 0, limit: 10 })
    expect(result.success).toBe(true)
    if (!result.success)
      return
    expect(result.data.total).toBe(2)
    expect(result.data.items.map(e => e.content)).toEqual(['1', '3'])
  })
  it('1001 raw candidates reject list/page/filtered clear before any deletion, including expired rows', async () => {
    memoryMock.getAll.mockResolvedValue({ results: Array.from({ length: 1001 }, (_, index) => ({
      id: `m${index}`,
      memory: 'expired',
      metadata: { hai_object_id: 'u1', expiration_date: '2000-01-01' },
    })) })
    const ops = await createOps()
    for (const result of [
      await ops.list({ objectId: 'u1', limit: 1 }),
      await ops.listPage({ objectId: 'u1', limit: 1 }),
      await ops.clear({ objectId: 'u1', types: ['fact'] }),
    ]) {
      expect(result.success).toBe(false)
      if (!result.success)
        expect(result.error.code).toBe(HaiAIError.MEMORY_LIST_INCOMPLETE.code)
    }
    expect(memoryMock.delete).not.toHaveBeenCalled()
    expect(memoryMock.deleteAll).not.toHaveBeenCalled()
    expect(memoryMock.reset).not.toHaveBeenCalled()
  })

  it('listPage counts the complete set beyond SDK default 20, filtering expiration/type/scope before total', async () => {
    const today = new Date().toISOString().slice(0, 10)
    memoryMock.getAll.mockResolvedValue({ results: [
      ...Array.from({ length: 45 }, (_, index) => ({ id: `m${index}`, memory: 'row', metadata: { hai_object_id: 'u1', hai_type: 'fact', hai_scope: { topicId: 'A' } } })),
      { id: 'expired', memory: 'row', metadata: { hai_object_id: 'u1', expiration_date: '2000-01-01', hai_scope: { topicId: 'A' } } },
      { id: 'today', memory: 'row', metadata: { hai_object_id: 'u1', expiration_date: today, hai_scope: { topicId: 'A' } } },
      { id: 'invalid', memory: 'row', metadata: { hai_object_id: 'u1', expiration_date: '2000-02-30', hai_scope: { topicId: 'A' } } },
      { id: 'other-type', memory: 'row', metadata: { hai_object_id: 'u1', hai_type: 'event', hai_scope: { topicId: 'A' } } },
      { id: 'other-scope', memory: 'row', metadata: { hai_object_id: 'u1', hai_scope: { topicId: 'B' } } },
      { id: 'other-user', memory: 'row', metadata: { hai_object_id: 'u2', hai_scope: { topicId: 'A' } } },
    ] })
    const ops = await createOps()
    const result = await ops.listPage({ objectId: 'u1', types: ['fact'], scope: { topicId: 'A' }, offset: 40, limit: 10 })
    expect(result.success && result.data.total).toBe(47)
    expect(result.success && result.data.items).toHaveLength(7)
  })

  it('get/update/remove reject another subject or scope before mutation', async () => {
    memoryMock.get.mockResolvedValue({ id: 'm1', memory: 'private', metadata: { hai_object_id: 'u1', hai_scope: { topicId: 'A' } } })
    const ops = await createOps()
    for (const accessScope of [{ objectId: 'u2' }, { objectId: 'u1', scope: { topicId: 'B' } }]) {
      for (const result of [await ops.get('m1', accessScope), await ops.update('m1', { content: 'evil' }, accessScope), await ops.remove('m1', accessScope)]) {
        expect(result.success).toBe(false)
        if (!result.success)
          expect(result.error.code).toBe(HaiAIError.MEMORY_NOT_FOUND.code)
      }
    }
    expect(memoryMock.update).not.toHaveBeenCalled()
    expect(memoryMock.delete).not.toHaveBeenCalled()
  })

  it('failed in-place metadata update preserves existing memory without delete/add', async () => {
    memoryMock.get.mockResolvedValue({ id: 'm1', memory: 'original', metadata: { hai_object_id: 'u1' } })
    memoryMock.update.mockRejectedValueOnce(new Error('storage unavailable'))
    const ops = await createOps()
    const result = await ops.update('m1', { type: 'event' }, { objectId: 'u1' })
    expect(result.success).toBe(false)
    expect(memoryMock.delete).not.toHaveBeenCalled()
    expect(memoryMock.add).not.toHaveBeenCalled()
  })

  it('returns known write id when readback fails without retrying add', async () => {
    const ops = await createOps()
    memoryMock.add.mockResolvedValue({ results: [{ id: 'committed', memory: 'stored', metadata: { event: 'ADD' } }] })
    memoryMock.get.mockRejectedValueOnce(new Error('read unavailable'))
    const result = await ops.add({ objectId: 'u1', content: 'stored', type: 'event' })
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.ext).toEqual({ requiresEffectReconciliation: true, memoryIds: ['committed'] })
    expect(memoryMock.add).toHaveBeenCalledOnce()
    expect(memoryMock.delete).not.toHaveBeenCalled()
  })

  it('settles all extraction writes before reporting failure and all known ids for reconciliation', async () => {
    const llm = createLlmMock(JSON.stringify([{ content: 'one', type: 'fact', importance: 0.8 }, { content: 'two', type: 'fact', importance: 0.8 }]))
    const ops = await createOps(undefined, llm)
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    memoryMock.add.mockResolvedValueOnce({ results: [{ id: 'one' }] }).mockResolvedValueOnce({ results: [{ id: 'two' }] })
    memoryMock.get.mockImplementation(async (id: unknown) => {
      if (id === 'one')
        throw new Error('read unavailable')
      await gate
      return { id: 'two', memory: 'two', metadata: { hai_object_id: 'u1' } }
    })
    let settled = false
    const pending = ops.extract([{ role: 'user', content: 'facts' }], { objectId: 'u1' }).then((result) => {
      settled = true
      return result
    })
    await vi.waitFor(() => expect(memoryMock.get).toHaveBeenCalledTimes(2))
    expect(settled).toBe(false)
    release()
    const result = await pending
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.ext).toEqual({ requiresEffectReconciliation: true, memoryIds: ['one', 'two'] })
    expect(memoryMock.add).toHaveBeenCalledTimes(2)
  })
})
