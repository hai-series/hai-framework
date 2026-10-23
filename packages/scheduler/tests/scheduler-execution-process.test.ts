import type { HaiResult } from '@h-ai/core'
import type { ChildProcess } from 'node:child_process'
import type { Server, ServerResponse } from 'node:http'
import type { SchedulerExecutionEntry, TaskExecutionLog } from '../src/index.js'
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { reldb } from '@h-ai/reldb'
import { build } from 'tsup'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const temporaryRoot = fileURLToPath(new URL('../tmp/', import.meta.url))
let directory: string
let nodeA: ChildProcess
let nodeB: ChildProcess
let database: string
let receiverDatabase: string
let server: Server
let url: string
let requestIndex = 0
let caseIndex = 0
let nextId = 0
const children: ChildProcess[] = []
const heldResponses: ServerResponse[] = []
const requests: Array<{ receipt: string, sequence: number, attempt: number }> = []

/** IPC 是本测试的序列化边界，泛型由调用命令的公开返回契约确定。 */
function call<T = unknown>(child: ChildProcess, command: string, args: unknown = [], timeoutMs = 10_000): Promise<T> {
  const id = ++nextId
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.off('message', receive)
      reject(new Error(`Child command timed out: ${command}`))
    }, timeoutMs)
    function receive(message: { id: number, data?: unknown, error?: string }) {
      if (message.id !== id)
        return
      clearTimeout(timer)
      child.off('message', receive)
      if (message.error)
        reject(new Error(message.error))
      else
        resolve(message.data as T)
    }
    child.on('message', receive)
    child.send({ id, command, args })
  })
}

async function initializeNode(): Promise<ChildProcess> {
  const child = fork(fileURLToPath(new URL('./fixtures/scheduler-node.mjs', import.meta.url)), [], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'], execArgv: [] })
  children.push(child)
  expect(await call(child, 'init', { entry: pathToFileURL(join(directory, 'index.js')).href, database, leaseMs: 1000 })).toMatchObject({ success: true })
  return child
}

async function stopNode(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null)
    return
  try {
    if (child.connected)
      await call(child, 'close')
  }
  finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit')
      child.kill()
      await exited
    }
  }
}

async function state(child: ChildProcess, receipt: string): Promise<SchedulerExecutionEntry> {
  const result = await call<HaiResult<SchedulerExecutionEntry | null>>(child, 'executionGet', [receipt])
  if (!result.success || !result.data)
    throw new Error('Execution state not found')
  return result.data
}

async function effects(): Promise<number> {
  const result = await reldb.sql.query<{ value: number }>('SELECT value FROM scheduler_receiver_counter')
  if (!result.success)
    throw new Error(result.error.message)
  return result.data[0].value
}

beforeAll(async () => {
  await mkdir(temporaryRoot, { recursive: true })
  directory = await mkdtemp(join(temporaryRoot, 'execution-process-'))
  const root = fileURLToPath(new URL('../', import.meta.url))
  await build({
    config: false,
    entry: { 'index': join(root, 'src/index.ts'), 'scheduler-js-worker': join(root, 'src/scheduler-js-worker.js') },
    outDir: directory,
    format: ['esm'],
    target: 'node22',
    dts: false,
    silent: true,
    external: ['@h-ai/core', '@h-ai/reldb', 'croner', 'zod'],
  })
})

beforeEach(async () => {
  database = join(directory, `executions-${++caseIndex}.sqlite`)
  receiverDatabase = join(directory, `receiver-${caseIndex}.sqlite`)
  requests.length = 0
  requestIndex = 0
  expect((await reldb.init({ type: 'sqlite', database: receiverDatabase })).success).toBe(true)
  expect((await reldb.sql.execute('CREATE TABLE scheduler_receiver_ledger (receipt TEXT PRIMARY KEY, result TEXT NOT NULL)')).success).toBe(true)
  expect((await reldb.sql.execute('CREATE TABLE scheduler_receiver_counter (value INTEGER NOT NULL)')).success).toBe(true)
  expect((await reldb.sql.execute('INSERT INTO scheduler_receiver_counter (value) VALUES (0)')).success).toBe(true)
  server = createServer(async (request, response) => {
    const index = ++requestIndex
    const receipt = String(request.headers['idempotency-key'])
    requests.push({ receipt, sequence: Number(request.headers['x-scheduler-sequence']), attempt: Number(request.headers['x-scheduler-attempt']) })
    const tx = await reldb.tx.begin()
    if (!tx.success) {
      response.writeHead(503).end()
      return
    }
    try {
      // 去重记录与真实业务计数在同一事务提交，不能靠请求头存在或进程内 Set 代替证明。
      const inserted = await tx.data.execute('INSERT INTO scheduler_receiver_ledger (receipt, result) VALUES (?, ?) ON CONFLICT(receipt) DO NOTHING', [receipt, 'committed'])
      if (!inserted.success)
        throw new Error(inserted.error.message)
      if (inserted.data.changes === 1) {
        const applied = await tx.data.execute('UPDATE scheduler_receiver_counter SET value = value + 1')
        if (!applied.success)
          throw new Error(applied.error.message)
      }
      const committed = await tx.data.commit()
      if (!committed.success)
        throw new Error(committed.error.message)
      if (index === 1)
        heldResponses.push(response)
      else
        response.end('committed')
    }
    catch {
      await tx.data.rollback()
      response.writeHead(503).end()
    }
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Receiver has no port')
  url = `http://127.0.0.1:${address.port}`
  // 表创建顺序执行，业务争抢使用两个真实进程及同一数据库文件。
  nodeA = await initializeNode()
  nodeB = await initializeNode()
})

afterEach(async () => {
  for (const response of heldResponses.splice(0))
    response.end('committed')
  try {
    await Promise.all(children.splice(0).map(stopNode))
  }
  finally {
    server?.closeAllConnections()
    if (server?.listening)
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    await reldb.close()
  }
}, 20_000)

afterAll(async () => {
  // mkdtemp 创建的绝对目录位于包 tmp/，子进程、网络和数据库均已关闭。
  if (directory)
    await rm(directory, { recursive: true, force: true })
})

describe.sequential('durable execution across actual processes', () => {
  it('同分钟竞争、跨真实分钟长任务和手动入口共用串行槽，续租不依赖cache', async () => {
    const task = { id: 'long-global', name: 'long-global', cron: '* * * * *', handler: { kind: 'api', url, timeout: 90_000 } }
    expect(await call(nodeA, 'register', [task])).toMatchObject({ success: true })
    expect(await call(nodeA, 'start')).toMatchObject({ success: true })
    expect(await call(nodeB, 'start')).toMatchObject({ success: true })
    await vi.waitFor(() => expect(heldResponses).toHaveLength(1), { timeout: 3000 })
    const receipt = requests[0].receipt
    // 穿过真实分钟边界且超过 1 秒租约，证明续租和跨 occurrence 互斥，未伪造 Date.now。
    await new Promise(resolve => setTimeout(resolve, 60_050 - Date.now() % 60_000))
    await new Promise(resolve => setTimeout(resolve, 250))
    expect(requests).toHaveLength(1)
    expect(await state(nodeB, receipt)).toMatchObject({ status: 'running', attemptCount: 1 })
    for (const child of [nodeA, nodeB]) {
      const manual = await call<HaiResult<TaskExecutionLog>>(child, 'trigger', [task.id])
      expect(!manual.success || manual.data.status === 'interrupted').toBe(true)
    }
    expect(await effects()).toBe(1)
    expect(await call(nodeA, 'stop')).toMatchObject({ success: true })
    expect(await call(nodeB, 'stop')).toMatchObject({ success: true })
    heldResponses.pop()!.end('committed')
    await vi.waitFor(async () => expect(await state(nodeB, receipt)).toMatchObject({ status: 'success' }), { timeout: 3000 })
  }, 75_000)

  it('暂停旧进程后按同一 occurrence 接管；真实HTTP持久事务去重，旧进程恢复不能覆盖新结果', async () => {
    const task = {
      id: 'recover-safe',
      name: 'recover-safe',
      cron: '0 0 1 1 *',
      idempotent: true,
      retry: { maxAttempts: 3 },
      handler: { kind: 'api', url, timeout: 15_000, headers: { 'idempotency-key': 'spoofed', 'X-Scheduler-Attempt': '0' } },
    }
    expect(await call(nodeA, 'register', [task])).toMatchObject({ success: true })
    const oldRun = call<HaiResult<TaskExecutionLog>>(nodeA, 'trigger', [task.id, { idempotencyKey: 'one-business-operation' }], 16_000)
    void oldRun.catch(() => {})
    await vi.waitFor(() => expect(heldResponses).toHaveLength(1))
    const receipt = requests[0].receipt
    expect(await call(nodeA, 'pause', { milliseconds: 2600 })).toMatchObject({ success: true })
    // 接收端数据库也关闭重开，幂等记录不依赖内存缓存。
    await reldb.close()
    expect((await reldb.init({ type: 'sqlite', database: receiverDatabase })).success).toBe(true)
    expect(await call(nodeB, 'start')).toMatchObject({ success: true })
    await vi.waitFor(async () => expect(await state(nodeB, receipt)).toMatchObject({ status: 'success', attemptCount: 2 }), { timeout: 5000 })
    expect(requests).toHaveLength(2)
    expect(requests.map(request => request.receipt)).toEqual([receipt, receipt])
    expect(requests.map(request => request.attempt)).toEqual([1, 2])
    expect(requests[0].sequence).toBeGreaterThan(0)
    expect(requests[0].sequence).toBe(requests[1].sequence)
    expect(await effects()).toBe(1)
    expect(await oldRun).toMatchObject({ success: true, data: { status: 'unknown' } })
    expect(await state(nodeB, receipt)).toMatchObject({ status: 'success', attemptCount: 2 })
    await stopNode(nodeA)
    nodeA = await initializeNode()
    expect(await call(nodeA, 'trigger', [task.id, { idempotencyKey: 'one-business-operation' }])).toMatchObject({ success: true, data: { status: 'success', occurrenceId: receipt } })
    expect(requests).toHaveLength(2)
    expect(await effects()).toBe(1)
  }, 20_000)

  it('非幂等已开始的旧进程过期后转unknown并阻止cron/manual；先终止旧进程再条件裁定', async () => {
    const task = { id: 'unsafe', name: 'unsafe', cron: '* * * * *', handler: { kind: 'api', url, timeout: 15_000 } }
    expect(await call(nodeA, 'register', [task])).toMatchObject({ success: true })
    const oldRun = call<HaiResult<TaskExecutionLog>>(nodeA, 'trigger', [task.id, { idempotencyKey: 'unsafe-operation' }], 16_000)
    void oldRun.catch(() => {})
    await vi.waitFor(() => expect(heldResponses).toHaveLength(1))
    const receipt = requests[0].receipt
    expect(await call(nodeA, 'pause', { milliseconds: 2600 })).toMatchObject({ success: true })
    expect(await call(nodeB, 'start')).toMatchObject({ success: true })
    await vi.waitFor(async () => expect(await state(nodeB, receipt)).toMatchObject({ status: 'unknown' }), { timeout: 5000 })
    expect(await call(nodeB, 'trigger', [task.id])).toMatchObject({ success: true, data: { status: 'interrupted' } })
    expect(requests).toHaveLength(1)
    expect(await effects()).toBe(1)
    expect(await oldRun).toMatchObject({ success: true, data: { status: 'unknown' } })
    await stopNode(nodeA)
    expect(await call(nodeB, 'stop')).toMatchObject({ success: true })
    const unknown = await state(nodeB, receipt)
    expect(await call(nodeB, 'executionResolve', [receipt, { status: 'pending', expectedUpdatedAt: unknown.updatedAt }])).toMatchObject({ success: false })
    const resolved = await Promise.all([
      call<HaiResult<void>>(nodeB, 'executionResolve', [receipt, { status: 'success', expectedUpdatedAt: unknown.updatedAt }]),
      call<HaiResult<void>>(nodeB, 'executionResolve', [receipt, { status: 'discarded', expectedUpdatedAt: unknown.updatedAt }]),
    ])
    expect(resolved.filter(result => result.success)).toHaveLength(1)
    expect(await call(nodeB, 'trigger', [task.id, { idempotencyKey: 'new-explicit-operation' }])).toMatchObject({ success: true, data: { status: 'success' } })
    expect(requests).toHaveLength(2)
    expect(await effects()).toBe(2)
  }, 20_000)
})
