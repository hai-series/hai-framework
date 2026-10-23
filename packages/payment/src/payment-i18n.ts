/**
 * @h-ai/payment — i18n
 *
 * 模块 i18n 文案访问入口。
 * @module payment-i18n
 */

import { core } from '@h-ai/core'
import messagesEnUS from '../messages/en-US.json'
import messagesJaJP from '../messages/ja-JP.json'
import messagesZhCN from '../messages/zh-CN.json'

/**
 * 支付模块本地化消息键；编译时约束受维护的双语字典。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const key: PaymentMessageKey = 'payment_notInitialized'
 * const localized = paymentM(key)
 * ```
 */
type PaymentMessageKey = keyof typeof messagesZhCN

/**
 * payment 模块 i18n 文案获取器
 *
 * @param key - 文案 Key
 * @returns 本地化后的文案字符串
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const message = paymentM('payment_notInitialized')
 * const error = new Error(message)
 * ```
 */
export const paymentM = core.i18n.createMessageGetter<PaymentMessageKey>({
  'zh-CN': messagesZhCN,
  'en-US': messagesEnUS,
  'ja-JP': messagesJaJP,
})
