import type { HaiResult } from '@h-ai/core'
import type { PasswordJob } from './crypto-password-worker.js'
import type { AsyncPasswordOperations } from './crypto-types.js'
import { availableParallelism } from 'node:os'
import { core, err, HaiCommonError, ok } from '@h-ai/core'
import { cryptoM } from './crypto-i18n.js'
import { HaiCryptoError } from './crypto-types.js'

const logger = core.logger.child({ module: 'crypto', scope: 'password' })
const MAX_QUEUED_JOBS = 32

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
  const pool = core.worker.createPool<PasswordJob, HaiResult<string | boolean>>(
    new URL('./crypto-password-worker.js', import.meta.url),
    { maxWorkers, maxQueuedJobs: MAX_QUEUED_JOBS },
  )

  async function run(input: PasswordJob): Promise<HaiResult<string | boolean>> {
    const result = await pool.run(input)
    if (result.success)
      return result.data
    if (result.error.code === HaiCommonError.NOT_INITIALIZED.code)
      return err(HaiCryptoError.NOT_INITIALIZED, cryptoM('crypto_notInitialized', { locale: input.locale }))
    if (result.error.code === HaiCommonError.RATE_LIMIT_EXCEEDED.code)
      return err(HaiCryptoError.PASSWORD_BUSY, cryptoM('crypto_passwordBusy', { locale: input.locale }))
    return workerFailed(input)
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
    close: pool.close,
  }
}
