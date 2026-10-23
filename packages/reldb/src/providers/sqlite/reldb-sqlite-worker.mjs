/**
 * @h-ai/reldb — SQLite worker 线程脚本
 *
 * 纯 JavaScript，供 worker_threads 直接加载（源码与打包运行位置均可）。
 * 持有唯一 better-sqlite3 连接，按 FIFO 串行处理主线程消息，把同步查询的阻塞移出主线程事件循环。
 *
 * 消息协议：
 *   主线程 → worker: { id, op: 'all'|'get'|'run'|'exec'|'batch'|'close', sql?, params?, statements? }
 *   worker → 主线程: { id, ok, result } | { id, ok:false, error:{ message } } | { type:'ready'|'init-error' }
 */

import { createRequire } from 'node:module'
import { setTimeout as delay } from 'node:timers/promises'
import { parentPort, workerData } from 'node:worker_threads'

const require = createRequire(import.meta.url)

if (!parentPort) {
  throw new Error('reldb sqlite worker must run inside a worker thread')
}

/** 归一化错误为可结构化克隆的对象。 */
function serializeError(error) {
  return { message: error instanceof Error ? error.message : String(error) }
}

/** 打开当前线程拥有的数据库连接；WAL 在初始化阶段单独配置。 */
function openDatabase() {
  const Database = require('better-sqlite3')
  const database = new Database(workerData.database, { readonly: workerData.readonly ?? false })
  return database
}

let db = null

async function initialize() {
  try {
    db = openDatabase()
    // 先保存连接，再执行可能失败的 pragma；初始化失败仍能由 close/线程终止释放。
    if (workerData.walMode !== false) {
      // 与同步引擎一致：WAL 锁升级可直接返回 BUSY，原生等待与退避共用 5 秒预算。
      const deadline = performance.now() + 5000
      let contention
      try {
        for (;;) {
          if (contention && performance.now() >= deadline)
            throw contention
          db.pragma(`busy_timeout = ${Math.max(1, Math.ceil(deadline - performance.now()))}`)
          try {
            db.pragma('journal_mode = WAL')
            break
          }
          catch (error) {
            if (!error || typeof error !== 'object' || !('code' in error)
              || typeof error.code !== 'string' || !/^SQLITE_BUSY(?:_|$)/.test(error.code)
              || performance.now() >= deadline) {
              throw error
            }
            contention = error
            await delay(Math.min(25, Math.max(1, deadline - performance.now())))
          }
        }
      }
      finally {
        db.pragma('busy_timeout = 5000')
      }
    }
    parentPort.postMessage({ type: 'ready' })
  }
  catch (error) {
    parentPort.postMessage({ type: 'init-error', error: serializeError(error) })
  }

  parentPort.on('message', (msg) => {
    const { id, op, sql, params, statements } = msg

    if (op === 'close') {
      try {
        db?.close()
      }
      catch {
        // 忽略关闭异常，仍需回执并退出。
      }
      db = null
      parentPort.postMessage({ id, ok: true, result: undefined })
      parentPort.close()
      return
    }

    try {
      if (!db)
        throw new Error('sqlite worker database is not open')

      let result
      switch (op) {
        case 'all': {
          const stmt = db.prepare(sql)
          result = params ? stmt.all(...params) : stmt.all()
          break
        }
        case 'get': {
          const stmt = db.prepare(sql)
          result = (params ? stmt.get(...params) : stmt.get()) ?? null
          break
        }
        case 'run': {
          const stmt = db.prepare(sql)
          const runResult = params ? stmt.run(...params) : stmt.run()
          result = { changes: runResult.changes, lastInsertRowid: runResult.lastInsertRowid }
          break
        }
        case 'exec': {
          db.exec(sql)
          result = undefined
          break
        }
        case 'batch': {
          const database = db
          const tx = database.transaction((items) => {
            for (const item of items) {
              const stmt = database.prepare(item.sql)
              if (item.params)
                stmt.run(...item.params)
              else stmt.run()
            }
          })
          tx(statements)
          result = undefined
          break
        }
        default:
          throw new Error(`unknown sqlite worker op: ${op}`)
      }

      parentPort.postMessage({ id, ok: true, result })
    }
    catch (error) {
      parentPort.postMessage({ id, ok: false, error: serializeError(error) })
    }
  })
}

void initialize()
