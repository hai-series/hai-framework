/**
 * =============================================================================
 * @hai/core - i18n 模块导出
 * =============================================================================
 * 国际化工具模块
 *
 * 设计原则：
 * - 集中式 locale 管理：通过 core.i18n.subscribeLocale 统一管理全局 locale
 * - 通过 core.i18n.xxx 访问所有 i18n 功能
 * - JSON 消息：通过 createMessageGetter 统一消息获取
 *
 * 使用方式：
 * - core.i18n.setGlobalLocale('en-US') - 设置全局 locale
 * - core.i18n.createMessageGetter(messages) - 创建消息获取器（读取全局 locale）
 * =============================================================================
 */

import messagesEnUS from '../../messages/en-US.json'
import messagesZhCN from '../../messages/zh-CN.json'
import { i18n as baseI18n } from './core-i18n-utils.js'

// =============================================================================
// 对外入口（仅 const）
// =============================================================================

export type CoreMessageKey = keyof typeof messagesZhCN

const coreM = baseI18n.createMessageGetter<CoreMessageKey>({
  'zh-CN': messagesZhCN,
  'en-US': messagesEnUS,
})

export const i18n = {
  ...baseI18n,
  coreM,
}

// 仅对外导出类型
export type {
  InterpolationParams,
  Locale,
  LocaleInfo,
  LocaleMessages,
  MessageDictionary,
  MessageOptions,
} from './core-i18n-utils.js'
