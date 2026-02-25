import { core } from '@h-ai/core'
import messagesEnUS from '../messages/en-US.json'
import messagesZhCN from '../messages/zh-CN.json'

type CacheMessageKey = keyof typeof messagesZhCN

/**
 * 缓存模块 i18n 文案获取器
 *
 * @param key - 文案 Key
 * @param options - 插值参数
 * @returns 本地化后的文案字符串
 */
export const cacheM = core.i18n.createMessageGetter<CacheMessageKey>({
  'zh-CN': messagesZhCN,
  'en-US': messagesEnUS,
})
