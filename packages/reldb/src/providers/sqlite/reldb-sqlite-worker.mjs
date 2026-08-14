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
import { parentPort, workerData } from 'node:worker_threads'

const require = createRequire(import.meta.url)

if (!parentPort) {
  throw new Error('reldb sqlite worker must run inside a worker thread')
}

/** 归一化错误为可结构化克隆的对象。 */
function serializeError(error) {
  return { message: error instanceof Error ? error.message : String(error) }
}

/** 打开数据库连接并按需启用 WAL。 */
function openDatabase() {
  const Database = require('better-sqlite3')
  const database = new Database(workerData.database, { readonly: workerData.readonly ?? false })
  if (workerData.walMode !== false) {
    database.pragma('journal_mode = WAL')
  }
  return database
}

let db = null

try {
  db = openDatabase()
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
