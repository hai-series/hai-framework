/** 使用真实 Mem0 SDK 和 Qdrant 验证生产存储、主体隔离与有界完整列表。 */
import type { HaiResult } from '@h-ai/core'
import type { MemoryCoreOperations } from '../src/memory/ai-memory-types.js'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { acquireQdrantContainer } from '../../vecdb/tests/helpers/qdrant-container.js'
import { AIConfigSchema, MemoryConfigSchema } from '../src/ai-config.js'
import { ai } from '../src/ai-main.js'
import { HaiAIError } from '../src/ai-types.js'
import { createMemoryOperations } from '../src/memory/ai-memory-facade.js'
import { createMem0OssMemoryOperations } from '../src/memory/providers/ai-memory-provider-mem0-oss.js'

function unwrap<T>(result: HaiResult<T>): T {
  if (!result.success)
    throw new Error(`${result.error.code}: ${result.error.message}`)
  return result.data
}

describe('real Mem0 Qdrant contract', { timeout: 60_000 }, () => {
  let lease: Awaited<ReturnType<typeof acquireQdrantContainer>> | undefined
  let directory: string
  let operations: MemoryCoreOperations
  let createOperations: () => Promise<MemoryCoreOperations>
  let historyCreationCount = () => 0
  let restoreHistoryFactory = () => {}
  const collection = `mem0_${randomUUID().replaceAll('-', '')}`
  const server = createServer(async (request, response) => {
    let body = ''
    for await (const chunk of request)
      body += String(chunk)
    const input: { input: string | string[] } = JSON.parse(body)
    const count = Array.isArray(input.input) ? input.input.length : 1
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ object: 'list', data: Array.from({ length: count }, (_, index) => ({ object: 'embedding', index, embedding: [0.1, 0.2, 0.3] })), model: 'test', usage: { prompt_tokens: 1, total_tokens: 1 } }))
  })

  async function qdrant(path: string, method = 'GET', body?: unknown): Promise<unknown> {
    const response = await fetch(`${lease!.url}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const value: unknown = await response.json()
    if (!response.ok)
      throw new Error(`Qdrant ${response.status}: ${JSON.stringify(value)}`)
    return value
  }

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'hai-mem0-sdk-'))
    vi.stubEnv('MEM0_TELEMETRY', 'false')
    vi.stubEnv('MEM0_DIR', directory)
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('HAI_CORE_ENV', 'production')
    vi.stubEnv('HAI_E2E', '0')
    vi.stubEnv('HAI_E2E_MOCK', '0')
    const { HistoryManagerFactory } = await import('mem0ai/oss')
    const historyFactory = vi.spyOn(HistoryManagerFactory, 'create')
    historyCreationCount = () => historyFactory.mock.calls.length
    restoreHistoryFactory = () => historyFactory.mockRestore()
    lease = await acquireQdrantContainer()
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('Missing local embedding address')
    const aiConfig = AIConfigSchema.parse({ llm: { apiKey: 'test-only-local-key', model: 'embedding-test', baseUrl: `http://127.0.0.1:${address.port}/v1` } })
    createOperations = () => createMem0OssMemoryOperations({
      config: MemoryConfigSchema.parse({ provider: 'mem0', allowEphemeralFallback: true }),
      aiConfig,
      llm: ai.llm,
      collectionName: collection,
      embeddingDims: 3,
      vectorBackend: { type: 'qdrant', url: lease!.url },
    })
    operations = await createOperations()
    // 真实 add 同时等待 SDK 异步建表；infer:false 不调用 LLM。
    unwrap(await operations.add({ objectId: 'bootstrap', content: 'bootstrap', type: 'fact' }))
  }, 120_000)

  afterAll(async () => {
    restoreHistoryFactory()
    vi.unstubAllEnvs()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    await lease?.release()
    if (directory)
      await rm(directory, { recursive: true, force: true })
  }, 60_000)

  it('real add/get/search/update/delete/deleteAll preserve isolation and stable identifiers across factories', async () => {
    const first = unwrap(await operations.add({ objectId: 'alice', type: 'fact', content: 'Alice speaks Chinese', scope: { topic: 'profile' }, metadata: { source: 'manual' } }))
    const second = unwrap(await operations.add({ objectId: 'bob', type: 'fact', content: 'Bob speaks French' }))
    const replica = await createOperations()
    expect(unwrap(await replica.get(first.id, { objectId: 'alice' })).content).toBe('Alice speaks Chinese')
    for (const result of [await replica.get(first.id, { objectId: 'bob' }), await replica.update(first.id, { content: 'forged' }, { objectId: 'bob' }), await replica.remove(first.id, { objectId: 'bob' })]) {
      expect(result.success).toBe(false)
      if (!result.success)
        expect(result.error.code).toBe(HaiAIError.MEMORY_NOT_FOUND.code)
    }
    const changed = unwrap(await replica.update(first.id, { content: 'Alice prefers Chinese', type: 'preference', importance: 0.9, metadata: { source: 'verified' } }, { objectId: 'alice', scope: { topic: 'profile' } }))
    expect(changed).toMatchObject({ id: first.id, createdAt: first.createdAt, type: 'preference', importance: 0.9, content: 'Alice prefers Chinese', metadata: { source: 'verified' }, scope: { topic: 'profile' } })
    expect(unwrap(await operations.recall('speaks', { objectId: 'alice' })).map(entry => entry.id)).toEqual([first.id])
    expect(unwrap(await operations.list({ objectId: 'alice' })).map(entry => entry.id)).toEqual([first.id])
    unwrap(await replica.clear({ objectId: 'alice' }))
    expect(unwrap(await operations.list({ objectId: 'alice' }))).toEqual([])
    expect(unwrap(await operations.get(second.id, { objectId: 'bob' })).content).toBe('Bob speaks French')
    unwrap(await operations.remove(second.id, { objectId: 'bob' }))
    expect((await operations.get(second.id, { objectId: 'bob' })).success).toBe(false)
  })

  async function seed(subject: string, count: number, expired = false): Promise<void> {
    const points = Array.from({ length: count }, (_, index) => ({
      id: randomUUID(),
      vector: [0.1, 0.2, 0.3],
      payload: { user_id: subject, hai_object_id: subject, hai_type: index % 2 === 0 ? 'fact' : 'event', hai_scope: { topic: 'A' }, data: `row ${index}`, createdAt: '2024-01-01T00:00:00.000Z', ...(expired ? { expiration_date: '2000-01-01' } : {}) },
    }))
    await qdrant(`/collections/${collection}/points?wait=true`, 'PUT', { points })
  }

  it('lists more than SDK default 20 with exact filtered total and excludes expired records', async () => {
    await seed('complete', 45)
    await seed('complete', 3, true)
    const result = unwrap(await operations.listPage({ objectId: 'complete', types: ['fact'], scope: { topic: 'A' }, offset: 20, limit: 10 }))
    expect(result.total).toBe(23)
    expect(result.items).toHaveLength(3)
    unwrap(await operations.clear({ objectId: 'complete', types: ['event'] }))
    expect(unwrap(await operations.list({ objectId: 'complete' }))).toHaveLength(23)
  })

  it('rejects incomplete list/page/filtered deletion at 1001 including expired candidates without deleting any row', async () => {
    await seed('large', 1001, true)
    for (const result of [await operations.list({ objectId: 'large', limit: 1 }), await operations.listPage({ objectId: 'large' }), await operations.clear({ objectId: 'large', types: ['fact'] })]) {
      expect(result.success).toBe(false)
      if (!result.success)
        expect(result.error.code).toBe(HaiAIError.MEMORY_LIST_INCOMPLETE.code)
    }
    const count = await qdrant(`/collections/${collection}/points/count`, 'POST', { exact: true, filter: { must: [{ key: 'user_id', match: { value: 'large' } }] } })
    expect(count).toMatchObject({ result: { count: 1001 } })
    unwrap(await operations.clear({ objectId: 'large' }))
    expect(unwrap(await operations.list({ objectId: 'large' }))).toEqual([])
  })

  it('public empty clear refuses; confirmed admin reset clears all subjects using actual SDK reset', async () => {
    const publicMemory = createMemoryOperations(operations)
    expect((await publicMemory.clear()).success).toBe(false)
    expect(unwrap(await operations.list({ objectId: 'bootstrap' }))).toHaveLength(1)
    unwrap(await publicMemory.admin.clearAll({ confirm: true }))
    expect(unwrap(await operations.list({ objectId: 'bootstrap' }))).toEqual([])
    expect(unwrap(await operations.list({ objectId: 'complete' }))).toEqual([])
    // 真实 Memory 构造没有调用任何历史 Provider 工厂；disableHistory 不创建隐藏 SQLite。
    expect(historyCreationCount()).toBe(0)
  })
})
