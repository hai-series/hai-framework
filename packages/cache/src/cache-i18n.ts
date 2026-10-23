/**
 * @h-ai/cache — i18n
 *
 * 本文件提供缓存模块的 i18n 文案访问入口。
 * @module cache-i18n
 */

import { core } from '@h-ai/core'
import messagesEnUS from '../messages/en-US.json'
import messagesJaJP from '../messages/ja-JP.json'
import messagesZhCN from '../messages/zh-CN.json'

/**
 * 缓存内置消息键，与应用业务字典独立。
 * @example 模块内部上下文
 * ```ts
 * const key: CacheMessageKey = 'cache_notInitialized'
 * const message = cacheM(key)
 * ```
 */
type CacheMessageKey = keyof typeof messagesZhCN

/**
 * 缓存模块 i18n 文案获取器
 *
 * @param key - 文案 Key
 * @param options - 插值参数
 * @returns 本地化后的文案字符串
 * @example 模块内部上下文
 * ```ts
 * const message = cacheM('cache_notInitialized', { locale: 'en-US' })
 * ```
 */
export const cacheM = core.i18n.createMessageGetter<CacheMessageKey>({
  'zh-CN': messagesZhCN,
  'en-US': messagesEnUS,
  'ja-JP': messagesJaJP,
})
