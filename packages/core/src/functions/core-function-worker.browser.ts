import type { BrowserWorkerFunctions, WorkerEntry, WorkerExit, WorkerPoolOptions, WorkerThread } from '../core-worker-types.js'
import { createWorkerPool } from './core-function-worker.js'

/**
 * 启动浏览器线程，桥接消息和浏览器可观察的终止事件。
 * @example 模块内部上下文
 * ```ts
 * const thread = startWebWorker<string, number>(new URL('./report-worker.js', import.meta.url))
 * await thread.terminate()
 * ```
 */
export function startWebWorker<Input, Output>(entry: WorkerEntry): WorkerThread<Input, Output> {
  const thread = typeof entry === 'function'
    ? entry()
    : new Worker(entry, { type: 'module' })
  let stopped = false
  let stop: (status: WorkerExit) => void
  const exited = new Promise<WorkerExit>((resolve) => {
    stop = (status) => {
      if (stopped)
        return
      stopped = true
      thread.removeEventListener('error', onError)
      thread.removeEventListener('messageerror', onError)
      thread.terminate()
      resolve(status)
    }
  })
  function onError(event: Event): void {
    event.preventDefault()
    stop({
      code: 1,
      error: new Error('Web Worker failed'),
    })
  }
  thread.addEventListener('error', onError)
  thread.addEventListener('messageerror', onError)

  return {
    postMessage(input, transfer) {
      thread.postMessage(input, transfer
        ? [...transfer]
        : [])
    },
    onMessage(listener) {
      const receive = (event: MessageEvent<Output>) => listener(event.data)
      thread.addEventListener('message', receive)
      return () => thread.removeEventListener('message', receive)
    },
    exited,
    async terminate() {
      stop({ code: 0 })
      await exited
    },
  }
}

/**
 * 浏览器接入标准 Web Worker，供打包后的组件直接使用。
 * @example 模块内部上下文
 * ```ts
 * const webPool = worker.createPool<string, number>(new URL('./report-worker.js', import.meta.url), {
 *   maxWorkers: 1, maxQueuedJobs: 2,
 * })
 * await webPool.close()
 * ```
 */
export const worker: BrowserWorkerFunctions = {
  start: startWebWorker,
  createPool<Input, Output>(entry: WorkerEntry, options: WorkerPoolOptions) {
    return createWorkerPool(() => ({
      thread: startWebWorker<Input, Output>(entry),
    }), options)
  },
}
