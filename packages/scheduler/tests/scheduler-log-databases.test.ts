/** SQLite/PG/MySQL 独立 Node：真实提交后丢回执、双节点补写、重启、大载荷与失租隔离。 */
import type { HaiResult } from '@h-ai/core'
import type { ReldbConfigInput } from '@h-ai/reldb'
import type { ChildProcess } from 'node:child_process'
import type { TaskExecutionLog } from '../src/index.js'
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { reldb } from '@h-ai/reldb'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { mysqlEnv, postgresEnv } from '../../reldb/tests/helpers/reldb-test-suite.js'

let directory: string
let nextId = 0
const entry = pathToFileURL(fileURLToPath(new URL('../dist/index.js', import.meta.url))).href

function call<T = unknown>(node: ChildProcess, command: string, args: unknown = []): Promise<T> {
  const id = ++nextId
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      node.off('message', receive)
      reject(new Error(`Node operation timed out: ${command}`))
    }, 30000)
    function receive(message: { id: number, data?: unknown, error?: string }) {
      if (message.id !== id)
        return
      clearTimeout(timer)
      node.off('message', receive)
      if (message.error)
        reject(new Error(message.error))
      else
        resolve(message.data as T)
    }
    node.on('message', receive)
    node.send({ id, command, args })
  })
}

async function stop(node: ChildProcess): Promise<void> {
  if (node.exitCode !== null || node.signalCode !== null)
    return
  try {
    expect(await call(node, 'close')).toMatchObject({ success: true })
  }
  finally {
    if (node.exitCode === null && node.signalCode === null) {
      const exited = once(node, 'exit')
      node.kill()
      await exited
    }
  }
}

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'scheduler-log-process-'))
})
afterAll(async () => {
  await rm(directory, { recursive: true, force: true })
})

for (const backend of ['sqlite', 'postgresql', 'mysql'] as const) {
  it(`${backend} 已确认终态跨独立进程重启/补写，不重放业务，大结果及全部尝试保持一致`, async () => {
    const env = backend === 'sqlite' ? undefined : await (backend === 'mysql' ? mysqlEnv() : postgresEnv())
    const config: ReldbConfigInput = env?.config ?? { type: 'sqlite', database: join(directory, 'logs.sqlite') }
    const children: ChildProcess[] = []
    const failures: unknown[] = []
    const capture = async (action: () => Promise<unknown>) => {
      try {
        await action()
      }
      catch (error) {
        failures.push(error)
      }
    }
    async function node(): Promise<ChildProcess> {
      const child = fork(fileURLToPath(new URL('./fixtures/scheduler-node.mjs', import.meta.url)), [], {
        env: { ...process.env, NODE_ENV: backend === 'sqlite' ? 'test' : 'production', HAI_CORE_ENV: backend === 'sqlite' ? 'test' : 'production', HAI_E2E: '0', HAI_E2E_MOCK: '0' },
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
        execArgv: [],
      })
      children.push(child)
      expect(await call(child, 'init', { entry, dbConfig: config, logEffects: true, leaseMs: 30000 })).toMatchObject({ success: true })
      return child
    }
    try {
      expect((await reldb.init(config)).success).toBe(true)
      for (const table of ['hai_scheduler_logs', 'hai_scheduler_executions', 'hai_scheduler_tasks', 'scheduler_log_effects'])
        expect((await reldb.ddl.dropTable(table, true)).success).toBe(true)
      expect((await reldb.sql.execute('CREATE TABLE scheduler_log_effects (occurrence_id VARCHAR(64) PRIMARY KEY, value INTEGER NOT NULL)')).success).toBe(true)
      const a = await node()
      const b = await node()
      const task = { id: 'cross-node-logs', name: 'Cross node logs', cron: '* * * * *' }
      expect(await call(a, 'register', [task])).toMatchObject({ success: true })
      expect(await call(a, 'logFault', { write: 'before', read: false })).toMatchObject({ success: true })
      const initial = await call<HaiResult<TaskExecutionLog>>(a, 'trigger', [task.id, { idempotencyKey: 'business-receipt' }])
      expect(initial).toMatchObject({ success: true, data: { status: 'success', persistence: { status: 'pending' } } })
      if (!initial.success || !initial.data.occurrenceId)
        throw new Error('Receipt missing')
      const receipt = initial.data.occurrenceId
      await stop(a)
      expect(await call(b, 'executionLogFailures')).toMatchObject({ success: true, data: [expect.objectContaining({ occurrenceId: receipt, status: 'success' })] })
      // 第二个进程真实提交 INSERT 后丢回执，且当次确认读取失败；journal 仍应 pending。
      expect(await call(b, 'logFault', { write: 'after', read: true })).toMatchObject({ success: true })
      expect(await call(b, 'executionRepairLog', [receipt])).toMatchObject({ success: false, error: { code: 'hai:scheduler:032' } })
      const inserted = await reldb.sql.get<{ total: number | string }>('SELECT COUNT(*) AS total FROM hai_scheduler_logs')
      expect(inserted.success && Number(inserted.data?.total)).toBe(1)
      expect(await call(b, 'logFault', { write: 'none', read: false })).toMatchObject({ success: true })
      const c = await node()
      const repaired = await Promise.all([call(b, 'executionRepairLog', [receipt]), call(c, 'executionRepairLog', [receipt])])
      expect(repaired).toMatchObject([{ success: true }, { success: true }])
      expect(await call(c, 'getLogs')).toMatchObject({ success: true, data: { total: 1, items: [expect.objectContaining({ id: initial.data.id, result: initial.data.result, persistence: { status: 'persisted' } })] } })
      expect(await call(c, 'trigger', [task.id, { idempotencyKey: 'business-receipt' }])).toMatchObject({ success: true, data: { id: initial.data.id, status: 'success', persistence: { status: 'persisted' } } })
      const effects = await reldb.sql.get<{ total: number | string }>('SELECT SUM(value) AS total FROM scheduler_log_effects')
      expect(effects.success && Number(effects.data?.total)).toBe(1)

      const retries = { ...task, id: 'all-attempts', idempotent: true, params: { failAttempts: 2 }, retry: { maxAttempts: 3 } }
      expect(await call(c, 'register', [retries])).toMatchObject({ success: true })
      expect(await call(c, 'trigger', [retries.id])).toMatchObject({ success: true, data: { status: 'success', persistence: { status: 'persisted' } } })
      const attempts = await call<HaiResult<{ total: number, items: TaskExecutionLog[] }>>(b, 'getLogs', [{ taskId: retries.id }])
      expect(attempts.success).toBe(true)
      if (attempts.success) {
        expect(attempts.data.total).toBe(3)
        expect(attempts.data.items.map(log => log.status).sort()).toEqual(['failed', 'failed', 'success'])
        expect(attempts.data.items.find(log => log.status === 'success')?.result?.length).toBeGreaterThan(16000)
      }
      const stale = { ...task, id: 'lost-owner', params: { expireBeforeReturn: true } }
      expect(await call(c, 'register', [stale])).toMatchObject({ success: true })
      const lost = await call<HaiResult<TaskExecutionLog>>(c, 'trigger', [stale.id])
      expect(lost).toMatchObject({ success: true, data: { status: 'unknown', persistence: { status: 'unconfirmed' } } })
      if (lost.success)
        expect(await call(b, 'executionRepairLog', [lost.data.occurrenceId])).toMatchObject({ success: false })
      expect(await call(b, 'getLogs', [{ taskId: stale.id }])).toMatchObject({ success: true, data: { total: 0 } })
    }
    catch (error) {
      failures.push(error)
    }
    finally {
      await Promise.all(children.map(child => capture(() => stop(child))))
      await capture(async () => expect((await reldb.close()).success).toBe(true))
      await capture(async () => env?.release?.())
    }
    if (failures.length === 1)
      throw failures[0]
    if (failures.length > 1)
      throw new AggregateError(failures, 'Log persistence validation failed')
  }, 180000)
}
