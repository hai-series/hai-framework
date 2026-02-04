/**
 * =============================================================================
 * @hai/crypto - i18n
 * =============================================================================
 *
 * 本文件提供加密模块的 i18n 文案访问入口。
 *
 * @example
 * ```ts
 * import { cryptoM } from '@hai/crypto'
 *
 * const message = cryptoM('crypto_sm2EncryptEmpty')
 * ```
 * =============================================================================
 */

import { core } from '@hai/core'
import messagesEnUS from '../messages/en-US.json'
import messagesZhCN from '../messages/zh-CN.json'

// =============================================================================
// i18n
// =============================================================================

type CryptoMessageKey = keyof typeof messagesZhCN

/**
 * 获取加密模块文案。
 *
 * @example
 * ```ts
 * import { cryptoM } from '@hai/crypto'
 *
 * const text = cryptoM('crypto_passwordEmpty')
 * ```
 */
export const cryptoM = core.i18n.createMessageGetter<CryptoMessageKey>({
  'zh-CN': messagesZhCN,
  'en-US': messagesEnUS,
})
