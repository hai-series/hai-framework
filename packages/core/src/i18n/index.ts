/**
 * =============================================================================
 * @hai/core - i18n 模块导出
 * =============================================================================
 * 国际化工具模块
 *
 * 设计原则：
 * - 集中式 locale 管理：通过 core.i18n.localeManager 统一管理全局 locale
 * - 通过 core.i18n.xxx 访问所有 i18n 功能
 * - Paraglide 优先：翻译由各包的 Paraglide 编译生成
 *
 * 使用方式：
 * - core.i18n.setGlobalLocale('en-US') - 设置全局 locale
 * - core.i18n.createMessageGetter(messages) - 创建消息获取器（自动订阅 locale 变化）
 * =============================================================================
 */

// 仅导出类型，函数通过 core.i18n 访问
export type {
  InterpolationParams,
  Locale,
  LocaleInfo,
  LocaleMessages,
  MessageDictionary,
} from './i18n-utils.js'
