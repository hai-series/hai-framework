import type { Task } from '@a2a-js/sdk'
/** 消息日志与共享有界执行队列的故障和等待边界。 */
import type { AgentExecutor } from '@a2a-js/sdk/server'
import type { A2AImplementation } from '../src/a2a/ai-a2a-functions.js'
import type { WireSendMessageRequest as MessageSendParams } from './helpers/a2a-wire.js'
import { Message, Role, TaskState } from '@a2a-js/sdk'
import { AgentEvent } from '@a2a-js/sdk/server'
import { afterEach, expect, it, vi } from 'vitest'
import { createA2AOperations, createA2AStores } from '../src/a2a/ai-a2a-functions.js'
import { createMemoryStoreProvider } from '../src/store/providers/ai-store-provider-memory.js'
import { decodeA2AResult } from './helpers/a2a-wire.js'

const active: A2AImplementation[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(active.splice(0).map(api => api.close()))
})
function input(): MessageSendParams {
  return {
    message: {
      role: 'ROLE_USER',
      messageId: crypto.randomUUID(),
      parts: [
        { text: 'hello' },
      ],
    },
  }
}
function node(stores: ReturnType<typeof createA2AStores>, executor: AgentExecutor, maxExecutionMs = 2000) {
  const api = createA2AOperations({
    agentCard: { name: 'logs', url: 'https://agent.example' },
    executor,
    runtime: { leaseMs: 1000, pollIntervalMs: 10, maxExecutionMs },
  }, stores)
  active.push(api)
  return api
}
async function send(api: A2AImplementation, params: MessageSendParams): Promise<Task | Message> {
  const result = await api.handleRequest({
    jsonrpc: '2.0',
    id: 'request',
    method: 'SendMessage',
    params,
  }, { agentId: 'alice' })
  expect(result.streaming).toBe(false)
  const response = result.body as { result?: Task | Message, error?: unknown }
  expect(response.error).toBeUndefined()
  if (!response.result)
    throw new Error('Missing response')
  expect(JSON.stringify(result)).not.toContain('private-db-password')
  return decodeA2AResult(response.result)
}
function executor() {
  const execute = vi.fn<AgentExecutor['execute']>(async (request, bus) => {
    bus.publish(AgentEvent.message(Message.fromJSON({
      messageId: 'answer',
      role: 'ROLE_AGENT',
      taskId: request.taskId,
      parts: [
        { text: 'completed effect' },
      ],
    })))
    bus.finished()
  })
  return {
    execute,
    cancelTask: async () => {},
  }
}

it('入站日志失败时不执行业务，同一消息跨节点重复调用不重放', async () => {
  const stores = createA2AStores(createMemoryStoreProvider())
  vi.spyOn(stores.messageStore, 'save').mockRejectedValue(new Error('private-db-password'))
  const worker = executor()
  const a = node(stores, worker)
  const b = node(stores, worker)
  const params = input()
  const result = await send(a, params)
  expect(result).toMatchObject({
    status: { state: TaskState.TASK_STATE_FAILED },
    metadata: {
      haiExecution: { requiresEffectReconciliation: true },
    },
  })
  expect(await send(b, params)).toMatchObject({
    status: { state: TaskState.TASK_STATE_FAILED },
  })
  expect(worker.execute).not.toHaveBeenCalled()
})

it('出站日志失败不会发布完成消息，也不会因同receipt重试而重复业务', async () => {
  const stores = createA2AStores(createMemoryStoreProvider())
  const save = stores.messageStore.save.bind(stores.messageStore)
  vi.spyOn(stores.messageStore, 'save').mockImplementation(async (...args) => {
    if (args[1].role === 'agent')
      throw new Error('private-db-password')
    await save(...args)
  })
  const worker = executor()
  const a = node(stores, worker)
  const b = node(stores, worker)
  const params = input()
  expect(await send(a, params)).toMatchObject({
    status: { state: TaskState.TASK_STATE_FAILED },
    metadata: {
      haiExecution: { requiresEffectReconciliation: true },
    },
  })
  expect(await send(b, params)).toMatchObject({
    status: { state: TaskState.TASK_STATE_FAILED },
  })
  expect(worker.execute).toHaveBeenCalledTimes(1)
  const [journal] = await stores.journalStore.query({})
  expect(journal?.events).toHaveLength(0)
  expect((await stores.messageStore.query({})).map(record => record.role)).toEqual(['user'])
})

it('finished 等待出站日志，发布后即可在其它节点完整读取', async () => {
  const stores = createA2AStores(createMemoryStoreProvider())
  const save = stores.messageStore.save.bind(stores.messageStore)
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  let saving = false
  vi.spyOn(stores.messageStore, 'save').mockImplementation(async (...args) => {
    if (args[1].role === 'agent') {
      saving = true
      await pending
    }
    await save(...args)
  })
  const worker = executor()
  const a = node(stores, worker)
  const b = node(stores, worker)
  let completed = false
  const result = send(a, input()).then((value) => {
    completed = true
    return value
  })
  try {
    await expect.poll(() => saving).toBe(true)
    expect(completed).toBe(false)
    expect((await stores.journalStore.query({}))[0]).toMatchObject({ finished: false, events: [] })
  }
  finally { release() }
  expect(await result).toMatchObject({ role: Role.ROLE_AGENT })
  const messages = await b.listMessages({ callerId: 'alice' })
  expect(messages.success).toBe(true)
  if (messages.success)
    expect(messages.data.total).toBe(2)
})

it('入站日志暂停跨过真实执行期限后，旧节点恢复也不得进入业务', async () => {
  const stores = createA2AStores(createMemoryStoreProvider())
  const save = stores.messageStore.save.bind(stores.messageStore)
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  vi.spyOn(stores.messageStore, 'save').mockImplementation(async (...args) => {
    await pending
    await save(...args)
  })
  const worker = executor()
  const a = node(stores, worker, 150)
  const result = send(a, input())
  try {
    await expect.poll(async () => (await stores.journalStore.query({}))[0]?.interrupted).toBe(true)
  }
  finally { release() }
  expect(await result).toMatchObject({
    status: { state: TaskState.TASK_STATE_FAILED },
  })
  expect(worker.execute).not.toHaveBeenCalled()
})

it('等待入站日志时跨节点取消，owner 确认尚未启动的业务不会随后运行', async () => {
  const stores = createA2AStores(createMemoryStoreProvider())
  const save = stores.messageStore.save.bind(stores.messageStore)
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  vi.spyOn(stores.messageStore, 'save').mockImplementation(async (...args) => {
    await pending
    await save(...args)
  })
  const worker = {
    ...executor(),
    cancelTask: vi.fn<AgentExecutor['cancelTask']>(async () => {}),
  }
  const a = node(stores, worker)
  const b = node(stores, worker)
  const started = await send(a, {
    ...input(),
    configuration: { returnImmediately: true },
  })
  if (!('id' in started))
    throw new Error('Missing task')
  const cancelled = b.handleRequest({
    jsonrpc: '2.0',
    id: 'cancel',
    method: 'CancelTask',
    params: { id: started.id },
  }, { agentId: 'alice' })
  try {
    await expect.poll(async () => (await stores.journalStore.get(started.id))?.cancelRequested).toBe(true)
  }
  finally { release() }
  expect((await cancelled).body).toMatchObject({
    result: {
      status: { state: 'TASK_STATE_CANCELED' },
    },
  })
  expect(worker.execute).not.toHaveBeenCalled()
  expect(worker.cancelTask).not.toHaveBeenCalled()
})
