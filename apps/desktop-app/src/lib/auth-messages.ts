/** 桌面认证错误文案；沿用 UI 的当前语言，不把未知服务端撤销状态展示为成功。 */
import { core } from '@h-ai/core'
import { getGlobalLocale } from '@h-ai/ui/i18n'
import messagesEnUS from '../../messages/en-US.json'
import messagesJaJP from '../../messages/ja-JP.json'
import messagesZhCN from '../../messages/zh-CN.json'

const messages = {
  'zh-CN': messagesZhCN,
  'en-US': messagesEnUS,
  'ja-JP': messagesJaJP,
}

const getMessage = core.i18n.createMessageGetter(messages)

/**
 * 根据 UI 当前语言读取登出失败文案；未知语言沿用 core 的默认回退。
 * @param key - 中英日文翻译文件共同维护的认证文案键。
 * @returns 可直接交给 Toast 的纯文本。
 * @example 模块内部上下文
 * ```ts
 * const message = authMessage('logoutUnconfirmed')
 * ```
 */
export function authMessage(key: keyof typeof messages['en-US']): string {
  return getMessage(key, { locale: getGlobalLocale() })
}
