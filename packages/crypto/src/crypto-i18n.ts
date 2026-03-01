/**
 * @h-ai/crypto — i18n
 *
 * 本文件提供加密模块的 i18n 文案访问入口。
 * @module crypto-i18n
 */

import { core } from '@h-ai/core'
import messagesEnUS from '../messages/en-US.json'
import messagesZhCN from '../messages/zh-CN.json'

/** 加密模块 i18n 消息键类型（自动从 zh-CN 消息文件推断） */
type CryptoMessageKey = keyof typeof messagesZhCN

/**
 * 加密模块 i18n 消息获取器
 *
 * 根据当前全局 locale 返回对应语言的消息文本，支持参数插值。
 *
 * @example
 * ```ts
 * cryptoM('crypto_sm2PublicKeyInvalid')
 * cryptoM('crypto_initFailed', { params: { error: 'bad config' } })
 * ```
 */
export const cryptoM = core.i18n.createMessageGetter<CryptoMessageKey>({
  'zh-CN': messagesZhCN,
  'en-US': messagesEnUS,
})
