/**
 * @h-ai/reldb — SQLite 执行引擎
 *
 * 屏蔽两种执行方式的差异，供 SQLite Provider 统一调用：
 *   - 同步引擎（默认）：主线程直接持有 better-sqlite3 连接，行为与历史实现完全一致。
 *   - worker 引擎：把唯一连接放进专用 worker 线程，主线程通过消息驱动，避免 better-sqlite3
 *     的同步查询阻塞主线程事件循环。WAL 只能改善数据库锁并发，无法避免同步调用占用调用线程，
 *     因此把阻塞移出主线程才是关键。
 *
 * 说明：worker 引擎只使用单个连接（单 worker），配合 Provider 主线程事务串行锁与 worker 的
 * FIFO 消息顺序保证事务正确性；不做只读连接池，避免事务/写路径复杂化。
 *
 * @module reldb-sqlite-engine
 */

import type BetterSqlite3 from 'better-sqlite3'
import type { ExecuteResult } from '../../reldb-types.js'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { Worker } from 'node:worker_threads'

const require = createRequire(import.meta.url)

/** 一条待执行的语句（批量 / 事务内使用）。 */
export interface SqliteStatement {
  sql: string
  params?: unknown[]
}

/**
 * SQLite 执行引擎接口。
 *
 * 所有方法均为异步：同步引擎内部仍是阻塞调用（签名异步保持一致），worker 引擎为真正的跨线程异步。
 */
export interface SqliteEngine {
  /**
   * 完成 WAL/worker 握手；必须先保存引擎引用，失败后仍通过 close 释放资源。
   * @example
   * try { await engine.initialize() } finally { await engine.close() }
   */
  initialize: () => Promise<void>
  /** 查询多行。 */
  all: (sql: string, params?: unknown[]) => Promise<unknown[]>
  /** 查询单行（无结果返回 null）。 */
  get: (sql: string, params?: unknown[]) => Promise<unknown>
  /** 执行修改语句，返回影响行数与自增主键。 */
  run: (sql: string, params?: unknown[]) => Promise<ExecuteResult>
  /** 执行无参数 SQL（DDL / BEGIN / COMMIT / ROLLBACK）。 */
  exec: (sql: string) => Promise<void>
  /** 在单个原子事务中批量执行语句。 */
  batch: (statements: SqliteStatement[]) => Promise<void>
  /** 关闭连接（worker 引擎同时终止线程）。 */
  close: () => Promise<void>
  /** 连接是否可用。 */
  isOpen: () => boolean
}

/** 引擎打开选项。 */
export interface SqliteEngineOptions {
  /** 数据库文件路径或 ':memory:'。 */
  database: string
  /** 是否只读。 */
  readonly: boolean
  /** 是否启用 WAL。 */
  walMode: boolean
}

/**
 * 创建同步引擎：主线程直接持有连接（默认执行方式）。
 *
 * @param options - 打开选项。
 * @returns 已拥有连接的引擎；调用 initialize 后才可执行 SQL。
 * @example
 * const engine = createSyncSqliteEngine(options)
 * try { await engine.initialize() } finally { await engine.close() }
 */
export function createSyncSqliteEngine(options: SqliteEngineOptions): SqliteEngine {
  const Database = require('better-sqlite3')
  const db = new Database(options.database, { readonly: options.readonly }) as BetterSqlite3.Database
  let initialized = false

  return {
    async initialize() {
      if (!initialized && options.walMode !== false)
        db.pragma('journal_mode = WAL')
      initialized = true
    },
    async all(sql, params) {
      const stmt = db.prepare(sql)
      return params ? stmt.all(...params) : stmt.all()
    },
    async get(sql, params) {
      const stmt = db.prepare(sql)
      return (params ? stmt.get(...params) : stmt.get()) ?? null
    },
    async run(sql, params) {
      const stmt = db.prepare(sql)
      const result = params ? stmt.run(...params) : stmt.run()
      return { changes: result.changes, lastInsertRowid: result.lastInsertRowid }
    },
    async exec(sql) {
      db.exec(sql)
    },
    async batch(statements) {
      const tx = db.transaction((items: SqliteStatement[]) => {
        for (const item of items) {
          const stmt = db.prepare(item.sql)
          if (item.params)
            stmt.run(...item.params)
          else stmt.run()
        }
      })
      tx(statements)
    },
    async close() {
      initialized = false
      if (db.open) {
        db.close()
      }
    },
    isOpen: () => initialized && db.open,
  }
}

/** 定位 worker 脚本；兼容源码（src 布局）与打包（dist 布局）两种运行位置。 */
function resolveWorkerUrl(): URL {
  const candidates = [
    // 源码 / 测试：引擎与 worker 同目录。
    new URL('./reldb-sqlite-worker.mjs', import.meta.url),
    // 打包：引擎被并入 dist/index.js，worker 复制到 dist/providers/sqlite/。
    new URL('./providers/sqlite/reldb-sqlite-worker.mjs', import.meta.url),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate))
      return candidate
  }
  // 回退到源码布局，让 Worker 抛出可诊断的加载错误。
  return candidates[0]
}

/** worker 响应消息。 */
interface WorkerResponse {
  id: number
  ok: boolean
  result?: unknown
  error?: { message: string }
}

/**
 * 创建 worker 引擎：把连接放进专用 worker 线程，卸载主线程阻塞。
 *
 * @param options - 打开选项。
 * @param connectTimeoutMs - 等待 worker 打开数据库的超时时间。
 * @returns 已拥有 worker 的引擎；initialize 在握手失败或超时时 reject。
 * @example
 * const engine = createWorkerSqliteEngine(options, 10_000)
 * try { await engine.initialize() } finally { await engine.close() }
 */
export function createWorkerSqliteEngine(
  options: SqliteEngineOptions,
  connectTimeoutMs: number,
): SqliteEngine {
  const worker = new Worker(resolveWorkerUrl(), {
    workerData: { database: options.database, readonly: options.readonly, walMode: options.walMode },
  })

  let seq = 0
  let open = false
  let exited = false
  let closing: Promise<void> | null = null
  const pending = new Map<number, { resolve: (value: unknown) => void, reject: (error: Error) => void }>()

  /** 连接失效时统一拒绝所有在途请求，避免 Promise 永久挂起。 */
  function rejectAll(error: Error): void {
    for (const entry of pending.values())
      entry.reject(error)
    pending.clear()
  }

  worker.on('message', (msg: WorkerResponse | { type: string }) => {
    // 初始化握手消息由 init Promise 处理，这里只处理带 id 的请求响应。
    if (!('id' in msg))
      return
    const entry = pending.get(msg.id)
    if (!entry)
      return
    pending.delete(msg.id)
    if (msg.ok)
      entry.resolve(msg.result)
    else entry.reject(new Error(msg.error?.message ?? 'sqlite worker error'))
  })
  worker.on('error', (error) => {
    open = false
    rejectAll(error instanceof Error ? error : new Error(String(error)))
  })
  worker.on('exit', (code) => {
    exited = true
    open = false
    if (pending.size > 0)
      rejectAll(new Error(`sqlite worker exited unexpectedly with code ${code}`))
  })

  /** 等待握手时同步处理 error/exit，并在所有完成路径释放定时器和临时监听器。 */
  function initialize(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        finish(new Error(`sqlite worker init timed out after ${connectTimeoutMs}ms`))
      }, connectTimeoutMs)

      function finish(error?: Error): void {
        clearTimeout(timer)
        worker.off('message', onHandshake)
        worker.off('error', onError)
        worker.off('exit', onExit)
        if (error) {
          reject(error)
        }
        else {
          open = true
          resolve()
        }
      }
      function onError(error: Error): void {
        finish(error)
      }
      function onExit(code: number): void {
        finish(new Error(`sqlite worker exited before ready with code ${code}`))
      }
      function onHandshake(msg: { type?: string }): void {
        if (msg?.type === 'ready') {
          finish()
        }
        else if (msg?.type === 'init-error') {
          finish(new Error((msg as { error?: { message: string } }).error?.message ?? 'sqlite worker init failed'))
        }
      }

      worker.on('message', onHandshake)
      worker.once('error', onError)
      worker.once('exit', onExit)
      if (exited)
        finish(new Error('sqlite worker exited before initialization'))
    })
  }

  /** 发送一条请求并等待响应。 */
  function post(op: string, payload: { sql?: string, params?: unknown[], statements?: SqliteStatement[] }): Promise<unknown> {
    if (!open)
      return Promise.reject(new Error('sqlite worker is not open'))
    const id = ++seq
    return new Promise<unknown>((resolve, reject) => {
      pending.set(id, { resolve, reject })
      worker.postMessage({ id, op, ...payload })
    })
  }

  return {
    initialize,
    // 边界反序列化：worker 通过结构化克隆回传，行/结果类型在此断言。
    async all(sql, params) {
      return (await post('all', { sql, params })) as unknown[]
    },
    async get(sql, params) {
      return await post('get', { sql, params })
    },
    async run(sql, params) {
      return (await post('run', { sql, params })) as ExecuteResult
    },
    async exec(sql) {
      await post('exec', { sql })
    },
    async batch(statements) {
      await post('batch', { statements })
    },
    close() {
      if (closing)
        return closing
      const wasOpen = open
      const gracefulClose = wasOpen ? post('close', {}) : Promise.resolve()
      open = false
      closing = (async () => {
        // 握手失败时也必须终止线程；终止失败保留所有权，下一次 close 再试。
        await gracefulClose.catch(() => undefined)
        if (!exited)
          await worker.terminate()
      })().finally(() => { closing = null })
      return closing
    },
    isOpen: () => open,
  }
}
