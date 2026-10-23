/** 真实 MySQL AI 初始化节点；只在测试 SQL 观察层同步已完成的元数据读取。 */
import process from 'node:process'
import { ai } from '@h-ai/ai'
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { vecdb } from '@h-ai/vecdb'

async function send(value) {
  if (process.connected)
    await new Promise((resolve, reject) => process.send(value, error => error ? reject(error) : resolve()))
}

async function main() {
  const input = JSON.parse(process.env.AI_INDEX_NODE_INPUT)
  core.init({ logging: { level: 'fatal' } })
  let release
  let close
  let finish
  const released = new Promise((resolve) => {
    release = resolve
  })
  const closing = new Promise((resolve) => {
    close = resolve
  })
  const finishing = new Promise((resolve) => {
    finish = resolve
  })
  process.on('message', (message) => {
    if (message.action === 'release')
      release()
    if (message.action === 'close')
      close()
    if (message.action === 'finish')
      finish()
  })
  let connectionId
  try {
    for (const initialize of [() => reldb.init(input.dbConfig), () => vecdb.init(input.vecdbConfig)]) {
      const result = await initialize()
      if (!result.success)
        throw new Error('Database dependency initialization failed')
    }
    const connection = await reldb.sql.get('SELECT CONNECTION_ID() AS id')
    if (!connection.success || !connection.data)
      throw new Error('Connection unavailable')
    connectionId = Number(connection.data.id)
    const query = reldb.sql.query.bind(reldb.sql)
    const execute = reldb.sql.execute.bind(reldb.sql)
    let paused = false
    reldb.sql.query = async (sql, params) => {
      const result = await query(sql, params)
      if (input.barrier && !paused && /information_schema\.STATISTICS/i.test(sql)
        && params?.[0] === 'hai_ai_context' && params?.[1] === 'idx_hai_ai_context_object_id'
        && result.success && result.data.length === 0) {
        paused = true
        // 两个进程都已经从真实数据库读到不存在，再同时放行 CREATE INDEX。
        await send({ phase: 'missing', connectionId })
        await released
      }
      return result
    }
    reldb.sql.execute = async (sql, params) => {
      const result = await execute(sql, params)
      if (!result.success && /^CREATE INDEX /i.test(sql)) {
        const seen = new Set()
        let cause = result.error
        while (cause && typeof cause === 'object' && !seen.has(cause)) {
          seen.add(cause)
          if (typeof cause.code === 'string' && /^[A-Z_]+$/.test(cause.code) && typeof cause.errno === 'number') {
            await send({ phase: 'ddl-error', code: cause.code, errno: cause.errno, index: /^CREATE INDEX (\w+)/i.exec(sql)?.[1] })
            break
          }
          cause = cause.cause
        }
      }
      return result
    }
    const initialized = await ai.init()
    await send({ phase: 'result', success: initialized.success, code: initialized.success ? undefined : initialized.error.code, initialized: ai.isInitialized, connectionId })
    await closing
  }
  catch {
    await send({ phase: 'fatal' })
  }
  finally {
    let cleanupSucceeded = true
    try {
      await ai.close()
    }
    catch {
      cleanupSucceeded = false
    }
    try {
      if (!(await vecdb.close()).success)
        cleanupSucceeded = false
    }
    catch {
      cleanupSucceeded = false
    }
    try {
      if (!(await reldb.close()).success)
        cleanupSucceeded = false
    }
    catch {
      cleanupSucceeded = false
    }
    await send({ phase: 'closed', cleanupSucceeded, connectionId, aiInitialized: ai.isInitialized, vectorInitialized: vecdb.isInitialized, databaseInitialized: reldb.isInitialized })
    // 保持进程存活，供父测试在断开 IPC 前检查 MySQL PROCESSLIST，不能靠退出隐式释放连接。
    await finishing
    process.disconnect()
  }
}

void main().catch(() => {
  process.exitCode = 1
})
