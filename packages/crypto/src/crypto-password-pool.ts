import type { HaiResult } from '@h-ai/core'
import type { PasswordJob } from './crypto-password-worker.js'
import type { AsyncPasswordOperations } from './crypto-types.js'
import { availableParallelism } from 'node:os'
import { Worker } from 'node:worker_threads'
import { core, err, ok } from '@h-ai/core'
import { cryptoM } from './crypto-i18n.js'
import { HaiCryptoError } from './crypto-types.js'

const logger = core.logger.child({ module: 'crypto', scope: 'password' })
const MAX_QUEUED_JOBS = 32

/**
 * 保留等待输入和完成回调，保证关闭、退出和正常响应每次只结束当前任务。
 * @example 模块内部上下文
 * ```ts
 * const job: PendingPasswordJob = {
 *   input: { operation: 'hash', password: 'example', locale: 'zh-CN' },
 *   finish: result => { void result.success },
 * }
 * ```
 */
interface PendingPasswordJob {
  input: PasswordJob
  finish: (result: HaiResult<string | boolean>) => void
}

/**
 * 线程串行处理任务，空闲时释放事件循环引用。
 * @example 模块内部上下文
 * ```ts
 * function idle(slot: PasswordWorker) { return slot.job === undefined }
 * ```
 */
interface PasswordWorker {
  thread: Worker
  job?: PendingPasswordJob
}

function unavailable(locale?: PasswordJob['locale']): HaiResult<never> {
  return err(HaiCryptoError.NOT_INITIALIZED, cryptoM('crypto_notInitialized', { locale }))
}

function workerFailed(job: PasswordJob): HaiResult<never> {
  const hashing = job.operation === 'hash'
  const definition = hashing ? HaiCryptoError.HASH_FAILED : HaiCryptoError.VERIFY_FAILED
  logger.error('Password worker task failed', { operation: job.operation, code: definition.code })
  return err(definition, cryptoM(hashing ? 'crypto_passwordHashFailed' : 'crypto_passwordVerifyFailed', { locale: job.locale }))
}

/**
 * 当前 Crypto 生命周期内共用的工作线程池，限制运行和等待数量，关闭时结束所有任务。
 * @example 模块内部上下文
 * ```ts
 * const pool = createPasswordWorkerPool()
 * try {
 *   const hashed = await pool.hashAsync('example')
 *   if (!hashed.success) throw new Error(hashed.error.message)
 * }
 * finally { await pool.close() }
 * ```
 */
export function createPasswordWorkerPool(): Pick<AsyncPasswordOperations, 'hashAsync' | 'verifyAsync'> & { close: () => Promise<void> } {
  const maxWorkers = Math.max(1, Math.min(4, availableParallelism() - 1))
  const workers = new Set<PasswordWorker>()
  const queue: PendingPasswordJob[] = []
  let closing: Promise<void> | undefined

  function startWorker(): PasswordWorker {
    const thread = new Worker(new URL('./crypto-password-worker.js', import.meta.url), { execArgv: [] })
    const slot: PasswordWorker = { thread }
    workers.add(slot)
    thread.on('message', (result: HaiResult<string | boolean>) => {
      const active = slot.job
      slot.job = undefined
      active?.finish(result)
      dispatch()
      if (!slot.job)
        thread.unref()
    })
    // 节点在 error 后发送 exit，等退出才释放并发名额并结算任务。
    thread.on('error', () => {})
    thread.once('exit', () => {
      if (!workers.delete(slot))
        return
      const active = slot.job
      slot.job = undefined
      if (active)
        active.finish(workerFailed(active.input))
      dispatch()
    })
    return slot
  }

  function dispatch(): void {
    if (closing)
      return
    while (queue.length) {
      let slot = [...workers].find(worker => !worker.job)
      if (!slot && workers.size >= maxWorkers)
        return
      const job = queue.shift()!
      try {
        slot ??= startWorker()
        slot.job = job
        slot.thread.ref()
        slot.thread.postMessage(job.input)
      }
      catch {
        if (slot) {
          slot.job = undefined
          slot.thread.unref()
        }
        job.finish(workerFailed(job.input))
      }
    }
  }

  function run(input: PasswordJob): Promise<HaiResult<string | boolean>> {
    if (closing)
      return Promise.resolve(unavailable(input.locale))
    if (queue.length >= MAX_QUEUED_JOBS)
      return Promise.resolve(err(HaiCryptoError.PASSWORD_BUSY, cryptoM('crypto_passwordBusy')))
    return new Promise((finish) => {
      queue.push({ input, finish })
      dispatch()
    })
  }

  return {
    async hashAsync(password, config) {
      const input = {
        operation: 'hash',
        password,
        config,
        locale: core.i18n.getGlobalLocale(),
      } as const
      const result = await run(input)
      if (!result.success)
        return result
      return typeof result.data === 'string'
        ? ok(result.data)
        : workerFailed(input)
    },
    async verifyAsync(password, hash) {
      const input = {
        operation: 'verify',
        password,
        hash,
        locale: core.i18n.getGlobalLocale(),
      } as const
      const result = await run(input)
      if (!result.success)
        return result
      return typeof result.data === 'boolean'
        ? ok(result.data)
        : workerFailed(input)
    },
    close() {
      if (closing)
        return closing
      for (const job of queue.splice(0))
        job.finish(unavailable(job.input.locale))
      const stopping = [...workers].map((slot) => {
        const job = slot.job
        slot.job = undefined
        if (job)
          job.finish(unavailable(job.input.locale))
        return slot.thread.terminate()
      })
      workers.clear()
      closing = Promise.allSettled(stopping).then(() => undefined)
      return closing
    },
  }
}
