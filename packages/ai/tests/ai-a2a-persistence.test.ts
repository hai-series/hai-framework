import type { AgentExecutor } from '@a2a-js/sdk/server'
import type { AIRelStore, AIRelStoreOptions, AIStoreProvider, StoreFilter, StorePage, StoreScope } from '../src/store/ai-store-types.js'
import { describe, expect, it, vi } from 'vitest'
import { createA2AOperations } from '../src/a2a/ai-a2a-functions.js'
import { HaiAIError } from '../src/ai-types.js'

function createMockRelStore<T>() {
  const save = vi.fn(async (_id: string, _data: T, _scope?: StoreScope) => undefined)
  const saveMany = vi.fn(async (_items: Array<{ id: string, data: T, scope?: StoreScope }>) => undefined)
  const get = vi.fn(async (_id: string) => undefined as T | undefined)
  const query = vi.fn(async (_filter: StoreFilter<T>) => [] as T[])
  const queryPage = vi.fn(async (_filter: StoreFilter<T>, _page: { offset: number, limit: number }) => ({ items: [] as T[], total: 0 }) as StorePage<T>)
  const remove = vi.fn(async (_id: string) => true)
  const removeBy = vi.fn(async (_filter: StoreFilter<T>) => 0)
  const count = vi.fn(async (_filter?: StoreFilter<T>) => 0)
  const clear = vi.fn(async (_filter?: StoreFilter<T>) => undefined)

  const mocks = { save, saveMany, get, query, queryPage, remove, removeBy, count, clear }

  const store: AIRelStore<T> = {
    save: (id, data, scope) => save(id, data, scope),
    saveMany: items => saveMany(items),
    get: id => get(id),
    query: filter => query(filter),
    queryPage: (filter, page) => queryPage(filter, page),
    remove: id => remove(id),
    removeBy: filter => removeBy(filter),
    count: filter => count(filter),
    clear: filter => clear(filter),
  }

  return { store, mocks }
}

function createMockStoreProvider(options?: { initializeError?: Error }): {
  storeProvider: AIStoreProvider
  initialize: ReturnType<typeof vi.fn>
  messageStoreMocks: ReturnType<typeof createMockRelStore<unknown>>['mocks']
} {
  const taskStore = createMockRelStore<unknown>()
  const messageStore = createMockRelStore<unknown>()
  const callRecordStore = createMockRelStore<unknown>()
  const initialize = options?.initializeError
    ? vi.fn(async () => { throw options.initializeError })
    : vi.fn(async () => undefined)

  const relStores = [taskStore.store, messageStore.store, callRecordStore.store]
  let relStoreIndex = 0

  const storeProvider: AIStoreProvider = {
    name: 'mock',
    createRelStore<T>(_name: string, _options?: AIRelStoreOptions): AIRelStore<T> {
      const store = relStores[relStoreIndex]
      relStoreIndex += 1
      return store as AIRelStore<T>
    },
    createVectorStore() {
      throw new Error('not implemented in test')
    },
    initialize,
  }

  return { storeProvider, initialize, messageStoreMocks: messageStore.mocks }
}

function createMockExecutor(): AgentExecutor {
  return {
    execute: vi.fn(async () => {}),
    cancelTask: vi.fn(async () => {}),
  }
}

describe('a2a persistence bootstrap', () => {
  it('listMessages returns STORE_FAILED when table bootstrap fails', async () => {
    const initializeError = new Error('ddl failed')
    const { storeProvider, messageStoreMocks } = createMockStoreProvider({ initializeError })
    const operations = createA2AOperations(
      {
        agentCard: { name: 'test-agent', url: 'https://example.com' },
        executor: createMockExecutor(),
      },
      {
        storeProvider,
      },
    )

    const result = await operations.listMessages({})
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiAIError.STORE_FAILED.code)
    expect(messageStoreMocks.queryPage).not.toHaveBeenCalled()
  })

  it('bootstraps A2A tables once and reuses the same ready barrier', async () => {
    const { storeProvider, initialize, messageStoreMocks } = createMockStoreProvider()
    const operations = createA2AOperations(
      {
        agentCard: { name: 'test-agent', url: 'https://example.com' },
        executor: createMockExecutor(),
      },
      {
        storeProvider,
      },
    )

    const first = await operations.listMessages({ limit: 10 })
    const second = await operations.listMessages({ limit: 10 })

    expect(first.success).toBe(true)
    expect(second.success).toBe(true)
    expect(initialize).toHaveBeenCalledTimes(1)
    expect(messageStoreMocks.queryPage).toHaveBeenCalledTimes(2)
  })
})
