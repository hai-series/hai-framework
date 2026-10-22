/** 三库双独立 Node：本机钟 ±2h 不参与租约，真实行锁等待也不能延长旧授权。 */
import type { HaiResult } from '@h-ai/core'
import type { ReldbConfigInput } from '@h-ai/reldb'
import type { ChildProcess } from 'node:child_process'
import type { StoredExecution } from '../src/repositories/scheduler-repository-execution.js'
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { reldb } from '@h-ai/reldb'
import { build } from 'tsup'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mysqlEnv, postgresEnv } from '../../reldb/tests/helpers/reldb-test-suite.js'
import { executionId } from '../src/repositories/scheduler-repository-execution.js'

const root = fileURLToPath(new URL('../', import.meta.url))
const temporaryRoot = join(root, 'tmp')
let directory: string
let nextId = 0

/** 独立读取真实 DB 时钟作为测试观察值，不受任一子进程的 Date.now 偏差影响。 */
async function databaseNow(): Promise<number> {
  const type = reldb.config?.type
  const expression = type === 'postgresql'
    ? 'FLOOR(EXTRACT(EPOCH FROM clock_timestamp()) * 1000)'
    : type === 'mysql' ? 'UNIX_TIMESTAMP(SYSDATE(3)) * 1000' : '(julianday(\'now\') - 2440587.5) * 86400000'
  const result = await reldb.sql.get<{ now: number | string }>(`SELECT ${expression} AS now`)
  if (!result.success || !result.data)
    throw new Error('Database clock unavailable')
  return Number(result.data.now)
}

function call<T = unknown>(node: ChildProcess, command: string, args: object = {}, started?: () => void): Promise<T> {
  const id = ++nextId
  return new Promise((resolveCall, reject) => {
    const timer = setTimeout(() => {
      node.off('message', receive)
      reject(new Error(`Clock node timed out: ${command}`))
    }, 15000)
    function receive(message: { id: number, started?: boolean, data?: unknown, error?: string }) {
      if (message.id !== id)
        return
      if (message.started) {
        started?.()
        return
      }
      clearTimeout(timer)
      node.off('message', receive)
      if (message.error)
        reject(new Error(message.error))
      else
        resolveCall(message.data as T) // IPC 命令表是测试的序列化边界，调用点声明真实返回类型。
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
  await mkdir(temporaryRoot, { recursive: true })
  directory = await mkdtemp(join(temporaryRoot, 'clock-process-'))
  // 只将真实内部仓库作为定向测试入口打包，生产 package.exports 不增加测试后门。
  await build({ config: false, entry: { 'clock-node': join(root, 'tests/fixtures/scheduler-clock-node.ts') }, outDir: directory, format: ['esm'], target: 'node22', dts: false, clean: false, silent: true, external: ['@h-ai/core', '@h-ai/reldb'] })
}, 60000)

afterAll(async () => {
  if (!directory)
    return
  if (!resolve(directory).startsWith(resolve(temporaryRoot) + sep))
    throw new Error('Temporary directory escaped test root')
  await rm(directory, { recursive: true, force: true })
})

for (const backend of ['sqlite', 'postgresql', 'mysql'] as const) {
  describe.sequential(`${backend} real clock fencing`, () => {
    let config: ReldbConfigInput
    let release: (() => Promise<void>) | undefined
    let a: ChildProcess
    let b: ChildProcess
    const task = { id: `clock-${backend}`, name: 'Clock test', cron: '* * * * *' }

    beforeAll(async () => {
      const env = backend === 'sqlite' ? undefined : await (backend === 'mysql' ? mysqlEnv() : postgresEnv())
      config = env?.config ?? { type: 'sqlite', database: join(directory, `${backend}.sqlite`) }
      release = env?.release
      expect((await reldb.init(config)).success).toBe(true)
      expect((await reldb.ddl.dropTable('hai_scheduler_executions', true)).success).toBe(true)
      const children: ChildProcess[] = []
      try {
        for (let index = 0; index < 2; index++) {
          const child = fork(join(directory, 'clock-node.js'), [], { windowsHide: true, execArgv: [], stdio: ['ignore', 'ignore', 'inherit', 'ipc'], env: { ...process.env, NODE_ENV: 'test', TZ: index === 0 ? 'Pacific/Honolulu' : 'Asia/Tokyo' } })
          children.push(child)
          expect(await call(child, 'init', { config })).toMatchObject({ success: true })
        }
        ;[a, b] = children
      }
      catch (error) {
        await Promise.all(children.map(stop))
        throw error
      }
    }, 180000)

    afterAll(async () => {
      try {
        await Promise.all([a, b].filter(Boolean).map(stop))
      }
      finally {
        try {
          await reldb.close()
        }
        finally {
          await release?.()
        }
      }
    }, 30000)

    it('live lease survives opposite ±2h clocks, including initial timestamps and isolation decisions', async () => {
      const receipt = executionId(task.id, 'manual', 'live')
      await call(a, 'clock', { offset: -7200000 })
      await call(b, 'clock', { offset: 7200000 })
      const before = await databaseNow()
      const claimed = await call<HaiResult<StoredExecution | null>>(a, 'claim', { task, receipt, leaseMs: 3000 })
      expect(claimed.success).toBe(true)
      if (!claimed.success || !claimed.data)
        throw new Error('Claim missing')
      expect(claimed.data.createdAt).toBeGreaterThanOrEqual(before - 100)
      expect(claimed.data.leasedUntil).toBeLessThanOrEqual(await databaseNow() + 3100)
      expect(await call(b, 'claim', { task, receipt, leaseMs: 3000 })).toMatchObject({ success: true, data: null })
      expect(await call(a, 'begin', { receipt, leaseMs: 3000 })).toMatchObject({ success: true })
      expect(await call(b, 'expired')).toMatchObject({ success: true, data: [] })
      expect(await call(b, 'isolate', { row: claimed.data })).toMatchObject({ success: false })
      expect(await call(a, 'renew', { receipt, leaseMs: 3000 })).toMatchObject({ success: true })
      expect(await call(a, 'finish', { receipt })).toMatchObject({ success: true })
    })

    it('expired owner with a slow clock cannot begin, renew or finish before another node takes over', async () => {
      const definition = { ...task, id: `${task.id}-expired` }
      const receipt = executionId(definition.id, 'manual', 'expired')
      await call(a, 'clock', { offset: 0 })
      const claimed = await call<HaiResult<StoredExecution | null>>(a, 'claim', { task: definition, receipt })
      if (!claimed.success || !claimed.data)
        throw new Error('Claim missing')
      await call(a, 'clock', { offset: -7200000 })
      await delay(1150)
      expect(await call(a, 'begin', { receipt })).toMatchObject({ success: false })
      expect(await call(a, 'renew', { receipt })).toMatchObject({ success: false })
      expect(await call(a, 'finish', { receipt })).toMatchObject({ success: false })
      expect(await call(b, 'isolate', { row: claimed.data })).toMatchObject({ success: true })
      expect(await call(b, 'get', { receipt })).toMatchObject({ success: true, data: { status: 'unknown' } })
    })

    it('expired claimed owner is replaced by the fast-clock node and the old handle stays fenced', async () => {
      const definition = { ...task, id: `${task.id}-takeover` }
      const receipt = executionId(definition.id, 'manual', 'takeover')
      await call(a, 'clock', { offset: 0 })
      const first = await call<HaiResult<StoredExecution | null>>(a, 'claim', { task: definition, receipt })
      if (!first.success || !first.data)
        throw new Error('Claim missing')
      await delay(1150)
      const next = await call<HaiResult<StoredExecution | null>>(b, 'claim', { task: definition, receipt })
      if (!next.success || !next.data)
        throw new Error('Takeover missing')
      expect(next.data.owner).not.toBe(first.data.owner)
      expect(next.data.leasedUntil).toBeLessThanOrEqual(await databaseNow() + 1100)
      expect(await call(a, 'begin', { receipt })).toMatchObject({ success: false })
      expect(await call(a, 'renew', { receipt })).toMatchObject({ success: false })
      expect(await call(a, 'finish', { receipt })).toMatchObject({ success: false })
      expect(await call(b, 'begin', { receipt })).toMatchObject({ success: true })
      expect(await call(b, 'finish', { receipt })).toMatchObject({ success: true })
    })

    it('a real database row lock held beyond the deadline cannot authorize a late final commit', async () => {
      const definition = { ...task, id: `${task.id}-lock-wait` }
      const receipt = executionId(definition.id, 'manual', 'lock-wait')
      await call(a, 'clock', { offset: 0 })
      expect(await call(a, 'claim', { task: definition, receipt })).toMatchObject({ success: true })
      expect(await call(a, 'begin', { receipt })).toMatchObject({ success: true })
      let unlock!: () => void
      const held = new Promise<void>((resolveHeld) => {
        unlock = resolveHeld
      })
      let locked!: () => void
      const ready = new Promise<void>((resolveReady) => {
        locked = resolveReady
      })
      const transaction = reldb.tx.wrap(async (tx) => {
        const lock = await tx.execute('UPDATE hai_scheduler_executions SET updated_at = updated_at WHERE occurrence_id = ?', [receipt])
        if (!lock.success)
          throw new Error(lock.error.message)
        locked()
        await held
        return undefined
      })
      try {
        await Promise.race([ready, transaction.then(() => {
          throw new Error('Lock transaction ended before the hold was released')
        })])
        let requested!: () => void
        const attempted = new Promise<void>((resolveAttempt) => {
          requested = resolveAttempt
        })
        const finishing = call(a, 'finish', { receipt }, requested)
        await attempted
        await delay(1150)
        unlock()
        expect((await transaction).success).toBe(true)
        expect(await finishing).toMatchObject({ success: false })
      }
      finally {
        unlock()
        await transaction
      }
      expect(await call(b, 'get', { receipt })).toMatchObject({ success: true, data: { status: 'running', logPersistence: 'unconfirmed' } })
    })

    it('public cron uses one DB minute and UTC across opposite clocks and different process TZ', async () => {
      expect((await reldb.sql.execute('CREATE TABLE scheduler_clock_effects (receipt VARCHAR(64) PRIMARY KEY, call_count INTEGER NOT NULL)')).success).toBe(true)
      let now = await databaseNow()
      if (now % 60000 > 58500) {
        await delay(1600)
        now = await databaseNow()
      }
      const utc = new Date(now)
      const definition = { ...task, id: `${task.id}-public-cron`, cron: `${utc.getUTCMinutes()} ${utc.getUTCHours()} * * *` }
      const expected = executionId(definition.id, 'scheduled', String(Math.floor(now / 60000)))
      await call(a, 'clock', { offset: -7200000 })
      await call(b, 'clock', { offset: 7200000 })
      expect(await call(a, 'initScheduler')).toMatchObject({ success: true })
      expect(await call(b, 'initScheduler')).toMatchObject({ success: true })
      expect(await call(a, 'register', { task: definition })).toMatchObject({ success: true })
      try {
        expect(await call(a, 'start')).toMatchObject({ success: true })
        expect(await call(b, 'start')).toMatchObject({ success: true })
        await expect.poll(async () => {
          const found = await reldb.sql.query<{ receipt: string, call_count: number }>('SELECT receipt, call_count FROM scheduler_clock_effects')
          if (!found.success)
            throw new Error(found.error.message)
          return found.data
        }).toEqual([{ receipt: expected, call_count: 1 }])
        await delay(300)
        const result = await reldb.sql.query<{ receipt: string, call_count: number }>('SELECT receipt, call_count FROM scheduler_clock_effects')
        expect(result).toMatchObject({ success: true, data: [{ receipt: expected, call_count: 1 }] })
      }
      finally {
        await Promise.all([call(a, 'stop'), call(b, 'stop')])
      }
    })
  })
}
