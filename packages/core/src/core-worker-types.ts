import type { WorkerOptions as NodeWorkerOptions } from 'node:worker_threads'
import type { HaiResult } from './core-types.js'

/**
 * 按编译目标取得 Web Worker 类型，Node 消费者只需 Node 类型库。
 * @example 模块内部上下文
 * ```ts
 * function webEntry(build: () => WebWorker): WorkerEntry { return build }
 * ```
 */
type WebWorker = typeof globalThis extends { Worker: { prototype: infer Instance } } ? Instance : never

/**
 * Node 转移 ArrayBuffer，浏览器采用其标准 postMessage 转移集合。
 * @example 模块内部上下文
 * ```ts
 * const buffers: WorkerTransfer[] = [new ArrayBuffer(16)]
 * ```
 */
type WorkerTransfer = ArrayBuffer | (typeof globalThis extends {
  Worker: { prototype: { postMessage: (input: unknown, options?: { transfer?: (infer Item)[] }) => void } }
} ? Item : never)

/**
 * 模块随包发布的入口 URL，或由浏览器打包器识别的 Web Worker 构造函数。
 * @example
 * ```ts
 * import type { WorkerEntry } from '@h-ai/core'
 * const entry: WorkerEntry = new URL('./report-worker.js', import.meta.url)
 * ```
 */
export type WorkerEntry = URL | (() => WebWorker)

/**
 * 独占线程的退出状态。浏览器在宿主终止线程时使用 0，加载或消息错误时使用 1。
 * @example
 * ```ts
 * import type { WorkerExit } from '@h-ai/core'
 * const stopped: WorkerExit = { code: 0 }
 * ```
 */
export interface WorkerExit {
  code: number
  error?: Error
}

/**
 * 独占线程的消息与退出接口。异步协议和业务状态由创建方管理。
 * @example
 * ```ts
 * import { core } from '@h-ai/core'
 * const thread = core.worker.start<string, number>(new URL('./report-worker.js', import.meta.url))
 * const unsubscribe = thread.onMessage(length => void length)
 * try { thread.postMessage('report') }
 * finally { unsubscribe() }
 * await thread.terminate()
 * ```
 */
export interface WorkerThread<Input, Output> {
  /** 消息须支持结构化克隆。Node 接收 ArrayBuffer，Web Worker 也接收浏览器可转移对象。 */
  postMessage: (input: Input, transfer?: readonly WorkerTransfer[]) => void
  /** 订阅消息并返回取消订阅函数。 */
  onMessage: (listener: (output: Output) => void) => () => void
  /** Node 在线程退出后完成，浏览器在宿主终止或收到线程错误后完成。 */
  readonly exited: Promise<WorkerExit>
  /** 请求终止线程并等待退出。 */
  terminate: () => Promise<void>
}

/**
 * 单任务、单响应的线程池，调用者持有并关闭。
 * @example
 * ```ts
 * import { core } from '@h-ai/core'
 * const pool = core.worker.createPool<string, number>(new URL('./report-worker.js', import.meta.url), {
 *   maxWorkers: 2, maxQueuedJobs: 4,
 * })
 * try {
 *   const result = await pool.run('report')
 *   if (result.success) void result.data
 * }
 * finally { await pool.close() }
 * ```
 */
export interface WorkerPool<Input, Output> {
  /**
   * 提交任务。池满、池关闭和线程故障分别返回通用限流、未初始化和内部错误。
   * 转移的缓冲区由调用方保留到任务派发，提交后应停止写入。
   */
  run: (input: Input, transfer?: readonly WorkerTransfer[]) => Promise<HaiResult<Output>>
  /** 结算未完成的任务并等待线程退出。 */
  close: () => Promise<void>
}

/**
 * 线程池容量和可选的空闲回收期限。
 * @example
 * ```ts
 * import type { WorkerPoolOptions } from '@h-ai/core'
 * const limits: WorkerPoolOptions = { maxWorkers: 2, maxQueuedJobs: 4, idleTimeoutMs: 30_000 }
 * ```
 */
export interface WorkerPoolOptions {
  /** 线程数上限，正整数。 */
  maxWorkers: number
  /** 等待任务数上限，非负整数。 */
  maxQueuedJobs: number
  /** 空闲线程回收期限，单位为毫秒。省略时保留线程至关闭。 */
  idleTimeoutMs?: number
}

/**
 * Node 侧的线程调度与进程内 CPU 卸载工具。
 * @example
 * ```ts
 * import { core, type NodeWorkerFunctions } from '@h-ai/core'
 * const workers: NodeWorkerFunctions = core.worker
 * ```
 */
export interface NodeWorkerFunctions {
  start: <Input, Output>(entry: WorkerEntry, options?: Pick<NodeWorkerOptions, 'workerData' | 'execArgv'>) => WorkerThread<Input, Output>
  createPool: <Input, Output>(entry: WorkerEntry, options: WorkerPoolOptions) => WorkerPool<Input, Output>
}

/**
 * 浏览器 Web Worker 调度工具，构造函数形式支持 Vite 打包时识别入口。
 * @example
 * ```ts
 * import type { BrowserWorkerFunctions } from '@h-ai/core'
 * function createPool(workers: BrowserWorkerFunctions) {
 *   return workers.createPool<string, number>(() => new Worker(new URL('./report-worker.js', import.meta.url), { type: 'module' }), {
 *     maxWorkers: 1, maxQueuedJobs: 2,
 *   })
 * }
 * ```
 */
export interface BrowserWorkerFunctions {
  start: <Input, Output>(entry: WorkerEntry) => WorkerThread<Input, Output>
  createPool: <Input, Output>(entry: WorkerEntry, options: WorkerPoolOptions) => WorkerPool<Input, Output>
}
