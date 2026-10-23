/** 执行领取/进入业务的截止条件，以及事件持久化失败后的队列边界。 */
import type { AgentExecutor, ExecutionEventBus, RequestContext } from '@a2a-js/sdk/server'
import { afterEach, expect, it, vi } from 'vitest'
import { createA2AOperations, createA2AStores } from '../src/a2a/ai-a2a-functions.js'
import { createMemoryStoreProvider } from '../src/store/providers/ai-store-provider-memory.js'

afterEach(() => vi.restoreAllMocks())

function latch() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

const input = { jsonrpc: '2.0' as const, id: 'boundary', method: 'message/send', params: { message: { kind: 'message', role: 'user', messageId: 'first', parts: [{ kind: 'text', text: 'hello' }] }, configuration: { blocking: false } } }

function instance(stores: ReturnType<typeof createA2AStores>, executor: AgentExecutor) {
  return createA2AOperations({ agentCard: { name: 'boundary', url: 'https://boundary.example' }, executor, runtime: { leaseMs: 1000, pollIntervalMs: 10, maxExecutionMs: 1000 } }, stores)
}

it('initial claim delayed beyond its deadline is rejected and only a fresh candidate can execute', async () => {
  const stores = createA2AStores(createMemoryStoreProvider())
  let now = Date.now()
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  const compare = stores.journalStore.compareAndSwap.bind(stores.journalStore)
  const claims: Array<{ notAfter?: number, accepted: boolean }> = []
  let first = true
  vi.spyOn(stores.journalStore, 'compareAndSwap').mockImplementation(async (id, value) => {
    if (value.expectedVersion !== undefined)
      return compare(id, value)
    if (first) {
      first = false
      now += 1001
    }
    const version = await compare(id, value)
    claims.push({ notAfter: value.notAfter, accepted: version !== undefined })
    return version
  })
  const execute = vi.fn(async (context: RequestContext, bus: ExecutionEventBus) => {
    const current = await stores.journalStore.get(context.taskId)
    expect(current!.deadline).toBeGreaterThan(now)
    expect(current!.leasedUntil).toBeGreaterThan(now)
    bus.publish({ kind: 'message', role: 'agent', messageId: 'answer', parts: [{ kind: 'text', text: 'done' }] })
    bus.finished()
  })
  const api = instance(stores, { execute, cancelTask: async () => {} })
  try {
    const result = await api.handleRequest(input, { agentId: 'alice' })
    expect(result.body).not.toHaveProperty('error')
    await vi.waitFor(() => expect(execute).toHaveBeenCalledOnce())
    expect(claims).toEqual([{ notAfter: now - 1, accepted: false }, { notAfter: now + 1000, accepted: true }])
    const records = await stores.journalStore.query({})
    expect(records).toHaveLength(1)
    expect(records[0].receipts).toHaveLength(1)
  }
  finally { await api.close() }
})

it.each(['deadline', 'close'] as const)('a committed claim delayed before execution cannot start business after %s', async (reason) => {
  const stores = createA2AStores(createMemoryStoreProvider())
  let now = Date.now()
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  const committed = latch()
  const respond = latch()
  const compare = stores.journalStore.compareAndSwap.bind(stores.journalStore)
  vi.spyOn(stores.journalStore, 'compareAndSwap').mockImplementation(async (id, value) => {
    const version = await compare(id, value)
    if (value.expectedVersion === undefined && version) {
      committed.release()
      await respond.promise
    }
    return version
  })
  const execute = vi.fn(async () => {})
  const api = instance(stores, { execute, cancelTask: async () => {} })
  try {
    const pending = api.handleRequest(input, { agentId: 'alice' })
    await committed.promise
    if (reason === 'deadline')
      now += 1001
    else await api.close()
    respond.release()
    await pending
    expect(execute).not.toHaveBeenCalled()
  }
  finally {
    respond.release()
    await api.close()
  }
})

it('an event CAS failure stops all later queued events and local completion notifications', async () => {
  const stores = createA2AStores(createMemoryStoreProvider())
  const compare = stores.journalStore.compareAndSwap.bind(stores.journalStore)
  const attempted: string[] = []
  let failed = false
  vi.spyOn(stores.journalStore, 'compareAndSwap').mockImplementation(async (id, value) => {
    const event = value.data.events.at(-1)
    if (event?.kind === 'task' || event?.kind === 'status-update') {
      attempted.push(event.status.state)
      if (!failed) {
        failed = true
        throw new Error('injected first event persistence failure')
      }
    }
    return compare(id, value)
  })
  const notification = vi.fn()
  const api = instance(stores, {
    async execute(context, bus) {
      bus.on('event', notification)
      bus.publish({ kind: 'task', id: context.taskId, contextId: context.contextId, status: { state: 'working' } })
      bus.publish({ kind: 'status-update', taskId: context.taskId, contextId: context.contextId, status: { state: 'completed' }, final: true })
      bus.finished()
    },
    cancelTask: async () => {},
  })
  try {
    const response = await api.handleRequest({ ...input, params: { ...input.params, configuration: { blocking: true } } }, { agentId: 'alice' })
    expect(response.body).toHaveProperty('result.status.state', 'failed')
    const records = await stores.journalStore.query({})
    expect(records[0].interrupted).toBe(true)
    expect(records[0].events).toEqual([])
    expect(attempted).toEqual(['working'])
    expect(notification).not.toHaveBeenCalled()
  }
  finally { await api.close() }
})
