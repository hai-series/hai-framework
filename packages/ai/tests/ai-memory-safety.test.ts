/** 通过公开 AI 入口验证记忆作用域、删除并发和存储失败边界。 */
import type { AIRelStoreOptions, AIStoreProvider } from '../src/index.js'
import { reldb } from '@h-ai/reldb'
import { afterEach, expect, it, vi } from 'vitest'
import { ai, HaiAIError } from '../src/index.js'
import { createDbStoreProviderFromModules } from '../src/store/providers/ai-store-provider-db.js'
import { createMemoryStoreProvider } from '../src/store/providers/ai-store-provider-memory.js'

afterEach(async () => {
  await ai.close()
})

it('空主体和空范围不能读取或清空其他主体', async () => {
  expect((await ai.init({
    memory: { embeddingEnabled: false },
  })).success).toBe(true)
  for (const objectId of ['user-a', 'user-b'])
    expect((await ai.memory.scoped({ objectId }).add({ content: objectId, type: 'fact' })).success).toBe(true)
  for (const objectId of ['', '  ', '\t'])
    expect(() => ai.memory.scoped({ objectId })).toThrow(TypeError)
  for (const options of [
    { scope: {} },
    { objectId: ' ', scope: {} },
    { types: [] },
  ]) {
    expect(await ai.memory.clear(options)).toMatchObject({
      success: false,
      error: { code: HaiAIError.MEMORY_STORE_FAILED.code },
    })
  }
  expect(await ai.memory.list()).toMatchObject({
    success: true,
    data: expect.any(Array),
  })
  const listed = await ai.memory.list()
  expect(listed.success && listed.data.length).toBe(2)
})

it.each(['get', 'recall'] as const)('迟到的 %s 访问统计不能复活已删除的记忆', async (operation) => {
  const base = createMemoryStoreProvider()
  let pause = false
  let release!: () => void
  let reached!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const blocked = new Promise<void>((resolve) => {
    reached = resolve
  })
  const provider: AIStoreProvider = {
    ...base,
    createRelStore<T>(name: string, options?: AIRelStoreOptions) {
      const store = base.createRelStore<T>(name, options)
      if (name === 'hai_ai_memory') {
        const compare = store.compareAndSwap.bind(store)
        store.compareAndSwap = async (id, input) => {
          if (pause) {
            reached()
            await gate
          }
          return compare(id, input)
        }
      }
      return store
    },
  }
  try {
    expect((await ai.init({
      memory: { embeddingEnabled: false },
    }, { storeProvider: provider })).success).toBe(true)
    const memory = ai.memory.scoped({ objectId: 'user-a' })
    const added = await memory.add({ content: 'Forget this', type: 'fact' })
    expect(added.success).toBe(true)
    if (!added.success)
      return
    pause = true
    const accessing = operation === 'get'
      ? memory.get(added.data.id)
      : memory.recall('Forget this')
    await blocked
    expect((await memory.remove(added.data.id)).success).toBe(true)
    release()
    await accessing
    expect(await memory.list()).toMatchObject({ success: true, data: [] })
  }
  finally {
    release()
    await ai.close()
  }
})

it('memory 和 Persona 的存储故障均返回 HaiResult', async () => {
  const base = createMemoryStoreProvider()
  let fail = false
  const provider: AIStoreProvider = {
    ...base,
    createRelStore<T>(name: string, options?: AIRelStoreOptions) {
      const store = base.createRelStore<T>(name, options)
      for (const method of [
        'get',
        'readVersioned',
        'query',
        'queryPage',
        'remove',
        'clear',
      ] as const) {
        const original = store[method]
        if (name === 'hai_ai_memory' || name === 'hai_ai_persona') {
          // Proxy 保留真实 Store 签名，只注入一次可控故障。
          Reflect.set(store, method, (...args: unknown[]) => {
            if (fail)
              return Promise.reject(new Error('Controlled private database diagnostic'))
            return Reflect.apply(original, store, args)
          })
        }
      }
      return store
    },
  }
  expect((await ai.init({}, { storeProvider: provider })).success).toBe(true)
  fail = true
  for (const operation of [
    () => ai.memory.get('missing'),
    () => ai.memory.remove('missing'),
    () => ai.memory.list(),
    () => ai.memory.listPage(),
    () => ai.memory.clear({ objectId: 'user-a' }),
    () => ai.persona.get('missing'),
    () => ai.persona.update('missing', {}),
    () => ai.persona.remove('missing'),
    () => ai.persona.list(),
    () => ai.persona.compose('missing'),
  ]) {
    const result = await operation()
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.message).not.toContain('private database diagnostic')
  }
})

it.each(['remove', 'clear', 'clearAll'] as const)('向量清理失败的 %s 保留记忆供同一入口重试', async (operation) => {
  const base = createMemoryStoreProvider()
  let fail = true
  const provider: AIStoreProvider = {
    ...base,
    createVectorStore(name) {
      const vectors = base.createVectorStore(name)
      const remove = vectors.remove.bind(vectors)
      const clear = vectors.clear.bind(vectors)
      vectors.remove = async (id) => {
        if (fail)
          throw new Error('Controlled vector cleanup failure')
        await remove(id)
      }
      vectors.clear = async (filter) => {
        if (fail)
          throw new Error('Controlled vector cleanup failure')
        await clear(filter)
      }
      return vectors
    },
  }
  expect((await ai.init({
    memory: { embeddingEnabled: false },
  }, { storeProvider: provider })).success).toBe(true)
  const memory = ai.memory.scoped({ objectId: 'user-a' })
  const added = await memory.add({ content: 'private', type: 'fact' })
  expect(added.success).toBe(true)
  if (!added.success)
    return
  const remove = () => operation === 'remove'
    ? memory.remove(added.data.id)
    : operation === 'clearAll'
      ? ai.memory.admin.clearAll({ confirm: true })
      : memory.clear()
  expect((await remove()).success).toBe(false)
  const retained = await memory.list()
  expect(retained.success && retained.data.length).toBe(1)
  fail = false
  expect((await remove()).success).toBe(true)
  expect(await memory.list()).toMatchObject({ success: true, data: [] })
})

it('默认关系库先提交删除与补偿，重启后重试向量清理', async () => {
  const base = createDbStoreProviderFromModules()
  const memoryId = 'memory-recovery-fixture'
  const vectors = new Set([memoryId])
  let unavailable = true
  let attempts = 0
  const provider: AIStoreProvider = {
    ...base,
    createVectorStore() {
      return {
        async upsert(id) { vectors.add(id) },
        async search() { return [] },
        async remove(id) {
          attempts += 1
          if (unavailable)
            throw new Error('Controlled vector outage')
          vectors.delete(id)
        },
        async clear() { vectors.clear() },
      }
    },
  }
  const config = {
    memory: { embeddingEnabled: false },
  }
  expect((await ai.init(config, { storeProvider: provider })).success).toBe(true)
  expect((await reldb.sql.execute(
    'INSERT INTO hai_ai_memory (id, object_id, version, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [
      memoryId,
      'alice',
      'fixture-version',
      JSON.stringify({
        id: memoryId,
        objectId: 'alice',
        content: 'private fixture',
        type: 'fact',
        importance: 0.5,
        accessCount: 0,
        createdAt: 1,
        lastAccessedAt: 1,
        vector: [1, 0],
      }),
      1,
      1,
    ],
  )).success).toBe(true)
  const memory = ai.memory.scoped({ objectId: 'alice' })
  expect((await memory.remove(memoryId)).success).toBe(true)
  expect(await memory.list()).toMatchObject({ success: true, data: [] })
  await vi.waitFor(() => expect(attempts).toBeGreaterThan(0))
  expect(vectors.has(memoryId)).toBe(true)
  await ai.close()
  unavailable = false
  expect((await ai.init(config, { storeProvider: provider })).success).toBe(true)
  await vi.waitFor(() => expect(vectors.has(memoryId)).toBe(false), { timeout: 4000 })
})

it('原生记忆只更新允许字段，按稳定主键分页清理同一作用域', async () => {
  expect((await ai.init({
    memory: { embeddingEnabled: false },
  })).success).toBe(true)
  const base = ai.memory.scoped({ objectId: 'alice' })
  const red = ai.memory.scoped({
    objectId: 'alice',
    scope: { project: 'red' },
  })
  const blue = ai.memory.scoped({
    objectId: 'alice',
    scope: { project: 'blue' },
  })
  const bob = ai.memory.scoped({ objectId: 'bob' })
  for (let index = 0; index < 130; index++) {
    const owner = index % 4 === 0
      ? red
      : blue
    expect((await owner.add({ content: `fixture ${index}`, type: 'fact' })).success).toBe(true)
  }
  expect((await bob.add({ content: 'another owner', type: 'fact' })).success).toBe(true)
  const entry = await red.add({ content: 'keep ownership', type: 'fact' })
  expect(entry.success).toBe(true)
  if (!entry.success)
    return
  const extraFields = {
    content: 'updated content',
    id: 'forged',
    vectorId: 'forged',
    objectId: 'bob',
    scope: { project: 'blue' },
  }
  expect(await red.update(entry.data.id, extraFields)).toMatchObject({
    success: true,
    data: {
      id: entry.data.id,
      objectId: 'alice',
      scope: { project: 'red' },
      content: 'updated content',
    },
  })
  expect((await bob.get(entry.data.id)).success).toBe(false)
  expect((await red.clear()).success).toBe(true)
  expect(await red.list()).toMatchObject({ success: true, data: [] })
  const remaining = await base.list()
  expect(remaining.success && remaining.data.length).toBe(97)
  expect(await bob.list()).toMatchObject({
    success: true,
    data: [
      { content: 'another owner' },
    ],
  })
})
