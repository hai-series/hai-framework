import type { WorkerOptions } from 'node:worker_threads'
import type { NodeWorkerFunctions, WorkerEntry, WorkerExit, WorkerPoolOptions } from '../core-worker-types.js'
import type { PoolWorker } from './core-function-worker.js'
import { Worker } from 'node:worker_threads'
import { startWebWorker } from './core-function-worker.browser.js'
import { createWorkerPool } from './core-function-worker.js'

function startNodeWorker<Input, Output>(entry: WorkerEntry, options?: WorkerOptions): PoolWorker<Input, Output> {
  if (typeof entry === 'function') {
    return {
      thread: startWebWorker(entry),
    }
  }

  const native = new Worker(entry, options)
  let error: Error | undefined
  const exited = new Promise<WorkerExit>((resolve) => {
    native.on('error', (failure) => {
      error = failure instanceof Error
        ? failure
        : new Error('Worker failed')
    })
    native.on('messageerror', (failure) => {
      error = failure
      void native.terminate().catch(() => {})
    })
    native.once('exit', code => resolve({ code, error }))
  })
  return {
    thread: {
      postMessage(input, transfer) {
        if (transfer && !transfer.every(value => value instanceof ArrayBuffer))
          throw new TypeError('Node workers accept only ArrayBuffer transfers')
        native.postMessage(input, transfer)
      },
      onMessage(listener) {
        native.on('message', listener)
        return () => {
          native.off('message', listener)
        }
      },
      exited,
      async terminate() {
        await native.terminate()
        await exited
      },
    },
    setReferenced: referenced => referenced
      ? native.ref()
      : native.unref(),
  }
}

/**
 * Node 使用模块自带的 ESM 文件地址启动线程。
 * @example 模块内部上下文
 * ```ts
 * const dedicated = worker.start<string, number>(new URL('./report-worker.js', import.meta.url))
 * await dedicated.terminate()
 * ```
 */
export const worker: NodeWorkerFunctions = {
  start<Input, Output>(entry: WorkerEntry, options?: Pick<WorkerOptions, 'workerData' | 'execArgv'>) {
    return startNodeWorker<Input, Output>(entry, options).thread
  },
  createPool<Input, Output>(entry: WorkerEntry, options: WorkerPoolOptions) {
    return createWorkerPool(() => startNodeWorker<Input, Output>(entry, { execArgv: [] }), options)
  },
}
