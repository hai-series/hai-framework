import type { Task } from '@a2a-js/sdk'
import type { ReldbConfigInput } from '@h-ai/reldb'
import type { VecdbConfigInput } from '@h-ai/vecdb'
/** 无粘性路由的真实双Node：远程订阅/取消、节点重启续接、实际暂停后拒绝旧写入。 */
import type { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { reldb } from '@h-ai/reldb'
import { expect, it } from 'vitest'
import { mysqlEnv, postgresEnv } from '../../reldb/tests/helpers/reldb-test-suite.js'
import { acquireQdrantContainer } from '../../vecdb/tests/helpers/qdrant-container.js'

interface Reply { id?: number, phase?: string, taskId?: string, body?: { result?: Task, error?: unknown }, event?: unknown, done?: boolean, failed?: boolean }
async function start(dbConfig: ReldbConfigInput, vecdbConfig: VecdbConfigInput, production: boolean) {
  const child = spawn(process.execPath, [fileURLToPath(new URL('./fixtures/a2a-node.mjs', import.meta.url))], {
    env: {
      ...process.env,
      NODE_ENV: production ? 'production' : 'test',
      HAI_CORE_ENV: production ? 'production' : 'test',
      HAI_E2E: '0',
      HAI_E2E_MOCK: '0',
      A2A_NODE_INPUT: JSON.stringify({ dbConfig, vecdbConfig }),
    },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  })
  const messages: Reply[] = []
  let stderr = ''
  let serial = 0
  child.stderr!.on('data', (chunk: Buffer) => {
    stderr = (stderr + chunk.toString()).slice(-8192)
  })
  child.stdout!.resume()
  child.on('message', message => messages.push(message as Reply))
  async function wait(predicate: (reply: Reply) => boolean, timeout = 30000): Promise<Reply> {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      const index = messages.findIndex(predicate)
      if (index >= 0)
        return messages.splice(index, 1)[0]!
      if (child.exitCode !== null || child.signalCode !== null)
        throw new Error(stderr || 'A2A node exited')
      await delay(20)
    }
    throw new Error(`A2A node timed out: ${stderr}`)
  }
  await wait(reply => reply.phase === 'ready')
  return {
    child,
    wait,
    send(method: string, params: unknown) {
      const id = ++serial
      child.send({ id, request: { jsonrpc: '2.0', id, method, params } })
      return id
    },
    async request(method: string, params: unknown) {
      const id = this.send(method, params)
      const reply = await wait(message => message.id === id && (message.body !== undefined || message.failed === true))
      expect(reply.failed).not.toBe(true)
      if (!reply.body)
        throw new Error('Missing response')
      return reply.body
    },
    async close() {
      if (child.exitCode !== null || child.signalCode !== null)
        return
      child.send({ action: 'close' })
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => child.kill(), 5000)
        child.once('exit', () => {
          clearTimeout(timer)
          resolve()
        })
      })
    },
  }
}

async function removeOwned(directory: string) {
  const target = resolve(directory)
  if (dirname(target) !== resolve(tmpdir()) || !target.startsWith(join(resolve(tmpdir()), 'hai-a2a-process-')))
    throw new Error('Unexpected cleanup path')
  await rm(target, { recursive: true, force: true })
}

it.each(['sqlite', 'postgresql', 'mysql'] as const)('真实双Node %s 跨节点订阅取消、重启续接及暂停丢租后不自动重放', async (backend) => {
  const directory = await mkdtemp(join(tmpdir(), 'hai-a2a-process-'))
  const nodes: Awaited<ReturnType<typeof start>>[] = []
  let releaseDatabase: (() => Promise<void>) | undefined
  let releaseVectors: (() => Promise<void>) | undefined
  const message = (id: string, text: string, taskId?: string) => ({ message: { kind: 'message', role: 'user', messageId: id, taskId, parts: [{ kind: 'text', text }] } })
  try {
    let dbConfig: ReldbConfigInput = { type: 'sqlite', database: join(directory, 'shared.db') }
    let vecdbConfig: VecdbConfigInput = { type: 'lancedb', path: join(directory, 'vectors') }
    if (backend !== 'sqlite') {
      const database = await (backend === 'postgresql' ? postgresEnv() : mysqlEnv())
      dbConfig = database.config
      releaseDatabase = database.release
      const vectors = await acquireQdrantContainer()
      vecdbConfig = { type: 'qdrant', url: vectors.url }
      releaseVectors = () => vectors.release()
    }
    expect((await reldb.init(dbConfig)).success).toBe(true)
    expect((await reldb.ddl.createTable('a2a_test_effects', { id: { type: 'INTEGER', primaryKey: true, autoIncrement: true }, task_id: { type: 'TEXT' }, message_id: { type: 'TEXT' } }, true)).success).toBe(true)
    expect((await reldb.ddl.createTable('a2a_test_cancels', { id: { type: 'INTEGER', primaryKey: true, autoIncrement: true }, task_id: { type: 'TEXT' } }, true)).success).toBe(true)
    const a = await start(dbConfig, vecdbConfig, backend !== 'sqlite')
    nodes.push(a)
    const b = await start(dbConfig, vecdbConfig, backend !== 'sqlite')
    nodes.push(b)
    const held = await a.request('message/send', { ...message('held', 'hold'), configuration: { blocking: false } })
    expect(held.error).toBeUndefined()
    const task = held.result!
    const subscription = b.send('tasks/resubscribe', { id: task.id })
    expect((await b.wait(reply => reply.id === subscription && reply.event !== undefined)).event).toBeDefined()
    const cancelled = await b.request('tasks/cancel', { id: task.id })
    expect(cancelled.result?.status.state).toBe('canceled')
    await b.wait(reply => reply.id === subscription && reply.done === true)
    const count = await reldb.sql.get<{ total: number }>('SELECT COUNT(*) AS total FROM a2a_test_cancels WHERE task_id = ?', [task.id])
    expect(count.success && Number(count.data?.total)).toBe(1)

    const awaiting = await a.request('message/send', message('first', 'input'))
    expect(awaiting.result?.status.state).toBe('input-required')
    await a.close()
    const resumed = await b.request('message/send', message('second', 'resume', awaiting.result!.id))
    expect(resumed.result?.status.state).toBe('completed')
    const replay = await b.request('message/send', message('second', 'resume', awaiting.result!.id))
    expect(replay.result?.status.state).toBe('completed')
    const effects = await reldb.sql.get<{ total: number }>('SELECT COUNT(*) AS total FROM a2a_test_effects WHERE task_id = ? AND message_id = ?', [awaiting.result!.id, 'second'])
    expect(effects.success && Number(effects.data?.total)).toBe(1)

    const restarted = await start(dbConfig, vecdbConfig, backend !== 'sqlite')
    nodes.push(restarted)
    const paused = await restarted.request('message/send', { ...message('paused', 'pause'), configuration: { blocking: false } })
    await restarted.wait(reply => reply.phase === 'paused')
    await delay(1200)
    const interrupted = await b.request('tasks/get', { id: paused.result!.id })
    expect(interrupted.result?.status.state).toBe('failed')
    await delay(1800)
    const after = await b.request('tasks/get', { id: paused.result!.id })
    expect(after.result?.status.state).toBe('failed')
    const notReplayed = await b.request('message/send', message('attempt-recovery', 'resume', paused.result!.id))
    expect(notReplayed.error).toBeDefined()
    const once = await reldb.sql.get<{ total: number }>('SELECT COUNT(*) AS total FROM a2a_test_effects WHERE task_id = ?', [paused.result!.id])
    expect(once.success && Number(once.data?.total)).toBe(1)
  }
  finally {
    await Promise.allSettled(nodes.map(node => node.close()))
    await reldb.close()
    await releaseVectors?.()
    await releaseDatabase?.()
    await removeOwned(directory)
  }
}, 180000)
