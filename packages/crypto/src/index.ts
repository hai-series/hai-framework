import type { AsyncPasswordOperations, PasswordOperations } from './crypto-types.js'
import { createCrypto } from './crypto-main.js'
import { createPasswordWorkerPool } from './crypto-password-pool.js'
import { createPasswordFunctions } from './crypto-password.js'
import { createTransportWorkerPool } from './transport/crypto-transport-pool.js'

export * from './crypto-exports.js'

/**
 * Node.js 加密服务。先检查初始化结果，再使用同步或异步密码操作，最后关闭。
 * @example
 * ```ts
 * import { crypto } from '@h-ai/crypto'
 * const initialized = await crypto.init()
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const result = await crypto.password.hashAsync('example')
 *   if (!result.success) throw new Error(result.error.message)
 * }
 * finally { await crypto.close() }
 * ```
 */
export const crypto = createCrypto<AsyncPasswordOperations>({
  createTransportCodec: createTransportWorkerPool,
  create(hash) {
    const { close, hashAsync, verifyAsync } = createPasswordWorkerPool()
    return {
      operations: {
        ...createPasswordFunctions({ hash }),
        hashAsync,
        verifyAsync,
      },
      close,
    }
  },
  unavailable(kit) {
    const sync = kit.proxy<PasswordOperations>('sync')
    const deferred = kit.proxy<AsyncPasswordOperations>('async')
    return {
      hash: sync.hash,
      verify: sync.verify,
      hashAsync: deferred.hashAsync,
      verifyAsync: deferred.verifyAsync,
    }
  },
})
