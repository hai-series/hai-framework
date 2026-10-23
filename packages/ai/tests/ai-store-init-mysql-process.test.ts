/** 真实 MySQL：双 Node 空库竞态、错误同名索引、权限失败及仍存活节点的连接释放。 */
import type { ReldbConfigInput } from '@h-ai/reldb'
import type { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { reldb } from '@h-ai/reldb'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { mysqlEnv } from '../../reldb/tests/helpers/reldb-test-suite.js'
import { acquireQdrantContainer } from '../../vecdb/tests/helpers/qdrant-container.js'

interface NodeMessage {
  phase: 'missing' | 'ddl-error' | 'result' | 'closed' | 'fatal'
  connectionId?: number
  success?: boolean
  initialized?: boolean
  code?: string
  errno?: number
  index?: string
  cleanupSucceeded?: boolean
  aiInitialized?: boolean
  vectorInitialized?: boolean
  databaseInitialized?: boolean
}

type MysqlConfigInput = Extract<ReldbConfigInput, { type: 'mysql' }>

let mysql: Awaited<ReturnType<typeof mysqlEnv>>

beforeAll(async () => {
  mysql = await mysqlEnv()
}, 180_000)

afterAll(async () => {
  await mysql?.release?.()
})

function start(dbConfig: ReldbConfigInput, vectorUrl: string, barrier = false) {
  const child = spawn(process.execPath, [fileURLToPath(new URL('./fixtures/store-index-node.mjs', import.meta.url))], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HAI_CORE_ENV: 'production',
      HAI_E2E: '0',
      HAI_E2E_MOCK: '0',
      AI_INDEX_NODE_INPUT: JSON.stringify({ dbConfig, vecdbConfig: { type: 'qdrant', url: vectorUrl }, barrier }),
    },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  })
  const replies: NodeMessage[] = []
  const driverErrors: NodeMessage[] = []
  let stderr = ''
  child.stdout?.resume()
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr = (stderr + chunk.toString()).slice(-8192)
  })
  child.on('message', (message) => {
    const reply = message as NodeMessage
    replies.push(reply)
    if (reply.phase === 'ddl-error')
      driverErrors.push(reply)
  })
  const exited = new Promise<void>((resolve) => {
    child.once('exit', () => resolve())
  })
  const send = (action: 'release' | 'close' | 'finish') => {
    if (child.connected)
      child.send({ action })
  }
  async function wait(phase: NodeMessage['phase'], timeout = 30000): Promise<NodeMessage> {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      const fatal = replies.find(reply => reply.phase === 'fatal')
      if (fatal && phase !== 'closed')
        throw new Error('Initialization node failed')
      const found = replies.findIndex(reply => reply.phase === phase)
      if (found >= 0)
        return replies.splice(found, 1)[0]!
      if (child.exitCode !== null || child.signalCode !== null)
        throw new Error(`Initialization node exited: ${stderr}`)
      await delay(20)
    }
    throw new Error(`Initialization node timed out: ${phase}`)
  }
  return {
    driverErrors,
    wait,
    release: () => send('release'),
    async close() {
      try {
        send('release')
        send('close')
        const closed = await wait('closed')
        expect(closed).toMatchObject({ cleanupSucceeded: true, aiInitialized: false, vectorInitialized: false, databaseInitialized: false })
        // Node 尚在等待 finish；必须由显式 close 释放连接，不能依赖进程退出代劳。
        const open = await reldb.sql.query('SELECT ID FROM information_schema.PROCESSLIST WHERE ID = ?', [closed.connectionId])
        expect(open.success).toBe(true)
        if (open.success)
          expect(open.data).toHaveLength(0)
      }
      finally {
        send('finish')
        const timer = setTimeout(() => child.kill(), 5000)
        try {
          await exited
        }
        finally {
          clearTimeout(timer)
        }
      }
    },
  }
}

async function withDatabase(operation: (context: {
  config: MysqlConfigInput
  database: string
  node: (config?: MysqlConfigInput, barrier?: boolean) => ReturnType<typeof start>
  account: (user: string) => void
}) => Promise<void>): Promise<void> {
  const env = mysql
  let vectors: Awaited<ReturnType<typeof acquireQdrantContainer>> | undefined
  const nodes: ReturnType<typeof start>[] = []
  const accounts: string[] = []
  const database = `ai_init_${crypto.randomUUID().replaceAll('-', '')}`
  const failures: unknown[] = []
  const capture = async (cleanup: () => Promise<unknown>) => {
    try {
      await cleanup()
    }
    catch (error) {
      failures.push(error)
    }
  }
  let created = false
  try {
    if (env.config.type !== 'mysql')
      throw new Error('Expected MySQL test configuration')
    vectors = await acquireQdrantContainer()
    expect((await reldb.close()).success).toBe(true)
    expect((await reldb.init(env.config)).success).toBe(true)
    expect((await reldb.sql.execute(`CREATE DATABASE ${database}`)).success).toBe(true)
    created = true
    const config: MysqlConfigInput = { ...env.config, database, pool: { max: 1 } }
    expect((await reldb.close()).success).toBe(true)
    expect((await reldb.init(config)).success).toBe(true)
    await operation({
      config,
      database,
      node: (connection = config, barrier = false) => {
        const child = start(connection, vectors!.url, barrier)
        nodes.push(child)
        return child
      },
      account: user => accounts.push(user),
    })
  }
  catch (error) {
    failures.push(error)
  }
  finally {
    await Promise.all(nodes.map(node => capture(() => node.close())))
    for (const account of accounts)
      await capture(async () => expect((await reldb.sql.execute(`DROP USER IF EXISTS '${account}'@'%'`)).success).toBe(true))
    if (created)
      await capture(async () => expect((await reldb.sql.execute(`DROP DATABASE ${database}`)).success).toBe(true))
    await capture(async () => expect((await reldb.close()).success).toBe(true))
    await capture(async () => expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true))
    await capture(async () => vectors?.release())
  }
  if (failures.length === 1)
    throw failures[0]
  if (failures.length > 1)
    throw new AggregateError(failures, 'MySQL initialization validation or cleanup failed')
}

it('真实空 MySQL 两进程同时读到无索引再放行 DDL，均成功且目标结构一致', async () => {
  await withDatabase(async ({ node, database }) => {
    const a = node(undefined, true)
    const b = node(undefined, true)
    const missing = await Promise.all([a.wait('missing'), b.wait('missing')])
    expect(missing[0]?.connectionId).not.toBe(missing[1]?.connectionId)
    a.release()
    b.release()
    const results = await Promise.all([a.wait('result'), b.wait('result')])
    expect(results.every(result => result.success && result.initialized)).toBe(true)
    // 来自 mysql2 的真实失败回执证明实际触发了竞态，而非两个节点恰好串行启动。
    expect([...a.driverErrors, ...b.driverErrors]).toContainEqual(expect.objectContaining({ code: 'ER_DUP_KEYNAME', errno: 1061, index: 'idx_hai_ai_context_object_id' }))
    const indexes = await reldb.sql.query<{ index_name: string, column_name: string, seq: number, non_unique: number, sub_part: number | null, index_type: string, collation: string, is_visible: string }>(
      'SELECT INDEX_NAME AS index_name, COLUMN_NAME AS column_name, SEQ_IN_INDEX AS seq, NON_UNIQUE AS non_unique, SUB_PART AS sub_part, INDEX_TYPE AS index_type, COLLATION AS collation, IS_VISIBLE AS is_visible FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME <> ? ORDER BY INDEX_NAME, SEQ_IN_INDEX',
      [database, 'hai_ai_context', 'PRIMARY'],
    )
    expect(indexes.success).toBe(true)
    if (indexes.success) {
      expect(indexes.data.filter(row => row.index_name === 'idx_hai_ai_context_object_session').map(row => row.column_name)).toEqual(['object_id', 'session_id'])
      expect(indexes.data.every(row => Number(row.non_unique) === 1 && row.sub_part === null && row.index_type === 'BTREE' && row.collation === 'A' && row.is_visible === 'YES')).toBe(true)
      expect(new Set(indexes.data.map(row => row.index_name)).size).toBe(3)
    }
  })
}, 180000)

it('真实同名错误列索引使公开 ai.init 失败，关闭后服务端无遗留连接', async () => {
  await withDatabase(async ({ node }) => {
    expect((await reldb.sql.execute('CREATE TABLE hai_ai_context (id VARCHAR(512) PRIMARY KEY, object_id VARCHAR(255), session_id VARCHAR(255), version VARCHAR(36) NOT NULL, data JSON NOT NULL, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL)')).success).toBe(true)
    expect((await reldb.sql.execute('CREATE INDEX idx_hai_ai_context_object_id ON hai_ai_context(session_id)')).success).toBe(true)
    const failed = await node().wait('result')
    expect(failed).toMatchObject({ success: false, initialized: false, code: 'hai:ai:011' })
  })
}, 180000)

it('真实 INDEX 权限不足仍失败，补齐权限后可在部分建表库中重试初始化', async () => {
  await withDatabase(async ({ node, config, database, account }) => {
    const username = `ai_init_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`
    const password = crypto.randomUUID().replaceAll('-', '')
    // 仅拼接本测试生成的十六进制标识/口令；MySQL 账户 DDL 不接收标识符占位参数。
    account(username)
    expect((await reldb.sql.execute(`CREATE USER '${username}'@'%' IDENTIFIED BY '${password}'`)).success).toBe(true)
    expect((await reldb.sql.execute(`GRANT SELECT, INSERT, UPDATE, DELETE, CREATE ON ${database}.* TO '${username}'@'%'`)).success).toBe(true)
    const denied = node({ ...config, user: username, password })
    expect(await denied.wait('result')).toMatchObject({ success: false, initialized: false, code: 'hai:ai:011' })
    expect(denied.driverErrors).toContainEqual(expect.objectContaining({ code: 'ER_TABLEACCESS_DENIED_ERROR', errno: 1142 }))
    expect((await reldb.sql.execute(`GRANT INDEX ON ${database}.* TO '${username}'@'%'`)).success).toBe(true)
    expect(await node({ ...config, user: username, password }).wait('result')).toMatchObject({ success: true, initialized: true })
  })
}, 180000)
