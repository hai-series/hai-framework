import type { HaiResult, Locale } from '../core-types.js'
import type { WorkerPool, WorkerPoolOptions, WorkerThread } from '../core-worker-types.js'
import { err, HaiCommonError, ok } from '../core-types.js'
import { i18n } from '../i18n/core-i18n-utils.js'

/**
 * 共享调度器的线程引用控制。浏览器线程只需要显式终止。
 * @example 模块内部上下文
 * ```ts
 * function slot(thread: WorkerThread<string, number>): PoolWorker<string, number> {
 *   return { thread }
 * }
 * ```
 */
export interface PoolWorker<Input, Output> {
  thread: WorkerThread<Input, Output>
  setReferenced?: (referenced: boolean) => void
}

/**
 * 等待或运行的任务，保存调用时的语言及结算函数。
 * @example 模块内部上下文
 * ```ts
 * function submittedIn(job: Job<string, number>) { return job.locale }
 * ```
 */
interface Job<Input, Output> {
  input: Input
  transfer?: readonly Transferable[]
  locale: Locale
  finish: (result: HaiResult<Output>) => void
}

/**
 * 线程当前任务及空闲回收状态。
 * @example 模块内部上下文
 * ```ts
 * function busy(slot: Slot<string, number>) { return slot.job !== undefined }
 * ```
 */
interface Slot<Input, Output> extends PoolWorker<Input, Output> {
  job?: Job<Input, Output>
  idleTimer?: ReturnType<typeof setTimeout>
  retiring?: boolean
}

function workerFailed(locale: Locale): HaiResult<never> {
  return err(HaiCommonError.INTERNAL_ERROR, i18n.coreM('core_workerFailed', { locale }))
}

function workerClosed(locale: Locale): HaiResult<never> {
  return err(HaiCommonError.NOT_INITIALIZED, i18n.coreM('core_workerClosed', { locale }))
}

/**
 * 接收平台适配器并管理单任务线程、等待队列、失败及关闭。
 * @example 模块内部上下文
 * ```ts
 * function oneThread(create: () => PoolWorker<string, number>) {
 *   return createWorkerPool(create, { maxWorkers: 1, maxQueuedJobs: 2 })
 * }
 * ```
 */
export function createWorkerPool<Input, Output>(
  start: () => PoolWorker<Input, Output>,
  { maxWorkers, maxQueuedJobs, idleTimeoutMs }: WorkerPoolOptions,
): WorkerPool<Input, Output> {
  if (!Number.isSafeInteger(maxWorkers) || maxWorkers < 1 || !Number.isSafeInteger(maxQueuedJobs) || maxQueuedJobs < 0
    || (idleTimeoutMs !== undefined && (!Number.isInteger(idleTimeoutMs) || idleTimeoutMs < 1 || idleTimeoutMs > 2_147_483_647))) {
    throw new RangeError('Invalid worker pool limits')
  }
  const workers = new Set<Slot<Input, Output>>()
  const queue: Job<Input, Output>[] = []
  let closing: Promise<void> | undefined

  function idle(slot: Slot<Input, Output>): void {
    slot.setReferenced?.(false)
    if (idleTimeoutMs === undefined || slot.idleTimer)
      return
    slot.idleTimer = setTimeout(() => {
      slot.idleTimer = undefined
      slot.retiring = true
      void slot.thread.terminate().catch(() => {
        slot.retiring = false
        dispatch()
      })
    }, idleTimeoutMs)
    if (typeof slot.idleTimer === 'object')
      slot.idleTimer.unref()
  }

  function startWorker(): Slot<Input, Output> {
    const slot: Slot<Input, Output> = start()
    workers.add(slot)
    const unsubscribe = slot.thread.onMessage((output) => {
      const job = slot.job
      slot.job = undefined
      job?.finish(ok(output))
      dispatch()
      if (!slot.job && !closing)
        idle(slot)
    })
    void slot.thread.exited.then(() => {
      unsubscribe()
      clearTimeout(slot.idleTimer)
      if (workers.delete(slot)) {
        const job = slot.job
        slot.job = undefined
        if (job)
          job.finish(workerFailed(job.locale))
        dispatch()
      }
    })
    return slot
  }

  function findIdle(): Slot<Input, Output> | undefined {
    for (const slot of workers) {
      if (!slot.job && !slot.retiring)
        return slot
    }
    return undefined
  }

  function dispatch(): void {
    if (closing)
      return
    while (queue.length) {
      let slot = findIdle()
      if (!slot && workers.size >= maxWorkers)
        return
      const job = queue.shift()!
      try {
        slot ??= startWorker()
        clearTimeout(slot.idleTimer)
        slot.idleTimer = undefined
        slot.job = job
        slot.setReferenced?.(true)
        slot.thread.postMessage(job.input, job.transfer)
      }
      catch {
        if (slot) {
          slot.job = undefined
          idle(slot)
        }
        job.finish(workerFailed(job.locale))
      }
    }
  }

  return {
    run(input, transfer) {
      const locale = i18n.getGlobalLocale()
      if (closing)
        return Promise.resolve(workerClosed(locale))
      if (queue.length >= maxQueuedJobs && workers.size >= maxWorkers && !findIdle())
        return Promise.resolve(err(HaiCommonError.RATE_LIMIT_EXCEEDED, i18n.coreM('core_workerBusy', { locale })))
      return new Promise((finish) => {
        queue.push({ input, transfer, locale, finish })
        dispatch()
      })
    },
    close() {
      if (closing)
        return closing
      for (const job of queue.splice(0))
        job.finish(workerClosed(job.locale))
      const stopping = [...workers].map((slot) => {
        clearTimeout(slot.idleTimer)
        const job = slot.job
        slot.job = undefined
        if (job)
          job.finish(workerClosed(job.locale))
        return slot.thread.terminate()
      })
      workers.clear()
      closing = Promise.allSettled(stopping).then(() => undefined)
      return closing
    },
  }
}
