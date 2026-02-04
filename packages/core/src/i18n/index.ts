/**
 * =============================================================================
 * @hai/core - i18n 模块导出
 * =============================================================================
 * 国际化工具模块
 *
 * 设计原则：
 * - 集中式 locale 管理：通过 core.i18n.localeManager 统一管理全局 locale
 * - 通过 core.i18n.xxx 访问所有 i18n 功能
 * - JSON 消息：通过 createMessageGetter 统一消息获取
 *
 * 使用方式：
 * - core.i18n.setGlobalLocale('en-US') - 设置全局 locale
 * - core.i18n.createMessageGetter(messages) - 创建消息获取器（自动订阅 locale 变化）
 * =============================================================================
 */

// core 内部消息获取器（对外可用）
export * from './core-i18n-messages.js'

// i18n 工具（函数与类型）
export * from './core-i18n-utils.js'
