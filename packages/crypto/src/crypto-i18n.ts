/**
 * @h-ai/crypto — i18n
 *
 * 本文件提供加密模块的 i18n 文案访问入口。
 * @module crypto-i18n
 */

import { core } from '@h-ai/core'
import messagesEnUS from '../messages/en-US.json'
import messagesJaJP from '../messages/ja-JP.json'
import messagesZhCN from '../messages/zh-CN.json'

/**
 * 模块内合法消息键，由中文词典推导；与英文词典一起维护。
 *
 * @example 模块内部上下文
 * ```ts
 * const key: CryptoMessageKey = 'crypto_sm2PublicKeyInvalid'
 * const message = cryptoM(key)
 * ```
 */
type CryptoMessageKey = keyof typeof messagesZhCN

/**
 * 按 Core 当前 locale 获取加密模块消息；错误插值不能包含密钥或明文。
 * @param key - 已维护的消息键。
 * @param options - locale 覆盖与 params 插值选项。
 * @returns 本地化消息。
 *
 * @example 模块内部上下文
 * ```ts
 * const message = cryptoM('crypto_initFailed', { locale: 'en-US', params: { error: 'Initialization failed' } })
 * ```
 */
export const cryptoM = core.i18n.createMessageGetter<CryptoMessageKey>({
  'zh-CN': messagesZhCN,
  'en-US': messagesEnUS,
  'ja-JP': messagesJaJP,
})
