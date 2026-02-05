/**
 * =============================================================================
 * @hai/cache - i18n
 * =============================================================================
 *
 * 本文件提供缓存模块的 i18n 文案访问入口。
 *
 * @example
 * ```ts
 * import { cacheM } from '@hai/cache'
 *
 * const message = cacheM('cache_someMessageKey')
 * ```
 * =============================================================================
 */

import { core } from '@hai/core'
import messagesEnUS from '../messages/en-US.json'
import messagesZhCN from '../messages/zh-CN.json'

// =============================================================================
// i18n
// =============================================================================

/**
 * 缓存模块文案 Key 类型
 */
type CacheMessageKey = keyof typeof messagesZhCN

/**
 * 获取缓存模块文案。
 * @param key - 文案 Key
 * @param options - 插值参数与格式化选项
 * @returns 本地化后的文案字符串
 * @remarks 具体参数结构与 core.i18n.createMessageGetter 保持一致。
 *
 * @example
 * ```ts
 * import { cacheM } from '@hai/cache'
 *
 * const text = cacheM('cache_someMessageKey')
 * ```
 */
export const cacheM = core.i18n.createMessageGetter<CacheMessageKey>({
  'zh-CN': messagesZhCN,
  'en-US': messagesEnUS,
})
