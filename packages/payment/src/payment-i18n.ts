/**
 * @h-ai/payment — i18n
 *
 * 模块 i18n 文案访问入口。
 * @module payment-i18n
 */

import { core } from '@h-ai/core'
import messagesEnUS from '../messages/en-US.json'
import messagesZhCN from '../messages/zh-CN.json'

type PaymentMessageKey = keyof typeof messagesZhCN

/**
 * payment 模块 i18n 文案获取器
 *
 * @param key - 文案 Key
 * @returns 本地化后的文案字符串
 */
export const paymentM = core.i18n.createMessageGetter<PaymentMessageKey>({
  'zh-CN': messagesZhCN,
  'en-US': messagesEnUS,
})
