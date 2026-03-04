/**
 * @h-ai/api-client — i18n
 *
 * 模块 i18n 文案访问入口。
 * @module api-client-i18n
 */

import { core } from '@h-ai/core'
import messagesEnUS from '../messages/en-US.json'
import messagesZhCN from '../messages/zh-CN.json'

type ApiClientMessageKey = keyof typeof messagesZhCN

/**
 * api-client 模块 i18n 文案获取器
 *
 * @param key - 文案 Key
 * @param options - 插值参数
 * @returns 本地化后的文案字符串
 */
export const apiClientM = core.i18n.createMessageGetter<ApiClientMessageKey>({
  'zh-CN': messagesZhCN,
  'en-US': messagesEnUS,
})
