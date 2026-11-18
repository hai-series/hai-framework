import type { PasswordOperations } from './crypto-types.js'
import { createCrypto } from './crypto-main.js'
import { createPasswordFunctions } from './crypto-password.js'

export * from './crypto-exports.js'

/**
 * 浏览器加密服务，提供同步加密、哈希和传输操作。
 * @example
 * ```ts
 * import { crypto } from '@h-ai/crypto'
 * const initialized = await crypto.init()
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const digest = crypto.hash.hash('example')
 *   if (!digest.success) throw new Error(digest.error.message)
 * }
 * finally { await crypto.close() }
 * ```
 */
export const crypto = createCrypto<PasswordOperations>({
  create: hash => ({
    operations: createPasswordFunctions({ hash }),
  }),
  unavailable: kit => kit.proxy<PasswordOperations>('sync'),
})
