/** 两个独立handler共享真实Store语义，覆盖journal、订阅、取消、续接与迟到写入。 */
import type { Message, MessageSendParams, Task } from '@a2a-js/sdk'
import type { AgentExecutor } from '@a2a-js/sdk/server'
import type { A2AImplementation } from '../src/a2a/ai-a2a-functions.js'
import { afterEach, expect, it, vi } from 'vitest'
import { createA2AOperations, createA2AStores } from '../src/a2a/ai-a2a-functions.js'
import { createMemoryStoreProvider } from '../src/store/providers/ai-store-provider-memory.js'

const instances: A2AImplementation[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(instances.splice(0).map(item => item.close()))
})
const input = (id = 'message-1', taskId?: string): MessageSendParams => ({ message: { kind: 'message', role: 'user', messageId: id, taskId, parts: [{ kind: 'text', text: 'hello' }] } })
function node(stores: ReturnType<typeof createA2AStores>, executor: AgentExecutor) {
  const api = createA2AOperations({ agentCard: { name: 'shared-test', url: 'https://agent.example' }, executor, runtime: { leaseMs: 1000, pollIntervalMs: 10, maxExecutionMs: 10000 } }, stores)
  instances.push(api)
  return api
}
/** 公开JSON-RPC结果必须非流式且无error。 */
async function request(api: A2AImplementation, method: string, params: unknown, caller = 'alice'): Promise<Task | Message> {
  const result = await api.handleRequest({ jsonrpc: '2.0', id: 'request', method, params }, { agentId: caller })
  const response = result.body as { result?: Task | Message, error?: unknown }
  expect(result.streaming).toBe(false)
  expect(response.error).toBeUndefined()
  if (!response.result)
    throw new Error('Missing JSON-RPC result')
  return response.result
}

it('同message两个节点并发仅执行一次，finished等待全部事件持久化', async () => {
  const stores = createA2AStores(createMemoryStoreProvider())
  let count = 0
  const executor: AgentExecutor = {
    async execute(context, bus) {
      count++
      bus.publish({ kind: 'message', role: 'agent', messageId: 'answer', taskId: context.taskId, parts: [{ kind: 'text', text: 'done' }] })
      bus.finished()
    },
    cancelTask: async () => {},
  }
  const a = node(stores, executor)
  const b = node(stores, executor)
  const results = await Promise.all([request(a, 'message/send', input()), request(b, 'message/send', input())])
  expect(count).toBe(1)
  expect(results.every(result => result.kind === 'message' && result.parts[0]?.kind === 'text')).toBe(true)
  const records = await stores.journalStore.query({})
  expect(records).toHaveLength(1)
  expect(records[0]!.events).toHaveLength(1)
  expect(records[0]!.finished).toBe(true)
  expect(records[0]!.task.status.state).toBe('completed')
})

it('b订阅A流并取消，由A真实cancel回调确认，B不会伪造取消', async () => {
  const stores = createA2AStores(createMemoryStoreProvider())
  let stop!: () => void
  const pending = new Promise<void>((resolve) => {
    stop = resolve
  })
  let cancelled = 0
  const a = node(stores, {
    async execute(context, bus) {
      bus.publish({ kind: 'task', id: context.taskId, contextId: context.contextId, status: { state: 'working' } })
      await pending
    },
    async cancelTask(taskId, bus) {
      cancelled++
      const current = await stores.journalStore.get(taskId)
      bus.publish({ kind: 'status-update', taskId, contextId: current!.task.contextId, status: { state: 'canceled' }, final: true })
      bus.finished()
      stop()
    },
  })
  const forbidden = vi.fn(async () => {
    throw new Error('Wrong node cancellation')
  })
  const b = node(stores, { execute: async () => {}, cancelTask: forbidden })
  const started = await request(a, 'message/send', { ...input(), configuration: { blocking: false } })
  if (started.kind !== 'task')
    throw new Error('Missing task')
  const subscribed = await b.handleRequest({ jsonrpc: '2.0', id: 'sub', method: 'tasks/resubscribe', params: { id: started.id } }, { agentId: 'alice' })
  expect(subscribed.streaming).toBe(true)
  expect((await subscribed.stream!.next()).done).toBe(false)
  const canceled = await request(b, 'tasks/cancel', { id: started.id })
  expect(canceled.kind === 'task' && canceled.status.state).toBe('canceled')
  expect(cancelled).toBe(1)
  expect(forbidden).not.toHaveBeenCalled()
  await subscribed.stream!.return()
})

it('input-required状态跨新节点续接，其他主体及context重用被拒绝', async () => {
  const stores = createA2AStores(createMemoryStoreProvider())
  const a = node(stores, { async execute(context, bus) {
    bus.publish({ kind: 'task', id: context.taskId, contextId: context.contextId, status: { state: 'input-required' } })
    bus.finished()
  }, cancelTask: async () => {} })
  const first = await request(a, 'message/send', input('first'))
  if (first.kind !== 'task')
    throw new Error('Missing task')
  const b = node(stores, { async execute(context, bus) {
    expect(context.task?.status.state).toBe('input-required')
    bus.publish({ kind: 'status-update', taskId: context.taskId, contextId: context.contextId, status: { state: 'completed' }, final: true })
    bus.finished()
  }, cancelTask: async () => {} })
  const next = await request(b, 'message/send', input('second', first.id))
  expect(next.kind === 'task' && next.status.state).toBe('completed')
  const foreign = await b.handleRequest({ jsonrpc: '2.0', id: 1, method: 'tasks/get', params: { id: first.id } }, { agentId: 'bob' })
  expect(foreign.body).toHaveProperty('error')
  const copiedContext = await b.handleRequest({ jsonrpc: '2.0', id: 1, method: 'message/send', params: { message: { ...input('other').message, contextId: first.contextId } } }, { agentId: 'bob' })
  expect(copiedContext.body).toHaveProperty('error')
  const emptyHistory = await request(b, 'tasks/get', { id: first.id, historyLength: 0 })
  expect(emptyHistory.kind === 'task' && emptyHistory.history).toEqual([])
})

it('实际持久期限过期后标中断，不接管未知副作用，旧owner恢复无法覆盖', async () => {
  const stores = createA2AStores(createMemoryStoreProvider())
  let now = Date.now()
  vi.spyOn(stores.journalStore, 'currentTime').mockImplementation(async () => now)
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const a = node(stores, { async execute(context, bus) {
    await gate
    bus.publish({ kind: 'task', id: context.taskId, contextId: context.contextId, status: { state: 'completed' } })
    bus.finished()
  }, cancelTask: async () => {} })
  const b = node(stores, { execute: async () => {
    throw new Error('Unknown effect replay')
  }, cancelTask: async () => {} })
  const started = await request(a, 'message/send', { ...input(), configuration: { blocking: false } })
  if (started.kind !== 'task')
    throw new Error('Missing task')
  now += 1001
  const expired = await request(b, 'tasks/get', { id: started.id })
  expect(expired.kind === 'task' && expired.status.state).toBe('failed')
  release()
  await a.close()
  const final = await request(b, 'tasks/get', { id: started.id })
  expect(final.kind === 'task' && final.status.state).toBe('failed')
  const state = await stores.journalStore.get(started.id)
  expect(state?.interrupted).toBe(true)
})

it('执行器只留下working便返回时，阻塞响应是持久failed且标明外部效果需核对', async () => {
  const stores = createA2AStores(createMemoryStoreProvider())
  const api = node(stores, { async execute(context, bus) {
    bus.publish({ kind: 'task', id: context.taskId, contextId: context.contextId, status: { state: 'working' } })
    bus.finished()
  }, cancelTask: async () => {} })
  const result = await request(api, 'message/send', input())
  expect(result.kind === 'task' && result.status.state).toBe('failed')
  expect(result.kind === 'task' && result.metadata?.haiExecution).toMatchObject({ interrupted: true, requiresEffectReconciliation: true })
})

it.each(['readVersioned', 'compareAndSwap', 'currentTime'] as const)('共享状态%s故障不会通过SDK响应泄漏驱动原始错误', async (method) => {
  const stores = createA2AStores(createMemoryStoreProvider())
  const secret = 'postgres://private-user:private-password@private-host/database'
  vi.spyOn(stores.journalStore, method).mockRejectedValue(new Error(secret))
  const api = node(stores, { execute: async () => {}, cancelTask: async () => {} })
  const response = await api.handleRequest({ jsonrpc: '2.0', id: 'fault', method: 'message/send', params: input() }, { agentId: 'alice' })
  expect(response.body).toHaveProperty('error.code', -32603)
  expect(JSON.stringify(response.body)).not.toContain(secret)
})

it('流式订阅读取失败也只抛固定协议错误', async () => {
  const stores = createA2AStores(createMemoryStoreProvider())
  const api = node(stores, { execute: async () => {}, cancelTask: async () => {} })
  vi.spyOn(stores.journalStore, 'readVersioned').mockRejectedValue(new Error('private-db-password'))
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const response = await api.handleRequest({ jsonrpc: '2.0', id: 'fault', method: 'tasks/resubscribe', params: { id: 'task' } }, { agentId: 'alice' })
  expect(response.streaming).toBe(true)
  await expect(response.stream!.next()).rejects.toMatchObject({ code: -32603 })
  expect(JSON.stringify(log.mock.calls)).not.toContain('private-db-password')
})

it('执行器异常的流显式交付持久failed Task，不以working状态静默结束', async () => {
  const stores = createA2AStores(createMemoryStoreProvider())
  const api = node(stores, {
    async execute() {
      throw new Error('private-business-error')
    },
    cancelTask: async () => {},
  })
  const response = await api.handleRequest({ jsonrpc: '2.0', id: 'stream', method: 'message/stream', params: input() }, { agentId: 'alice' })
  expect(response.streaming).toBe(true)
  const events: unknown[] = []
  for await (const event of response.stream!) events.push(event)
  expect(events).toContainEqual(expect.objectContaining({ result: expect.objectContaining({ kind: 'task', status: expect.objectContaining({ state: 'failed' }) }) }))
  expect(JSON.stringify(events)).not.toContain('private-business-error')
})
