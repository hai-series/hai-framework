/** 桌面应用的页面文案与组件库共用语言状态。 */
import { core } from '@h-ai/core'
import { createLocaleStore } from '@h-ai/ui/i18n'
import enUS from '../../messages/en-US.json'
import jaJP from '../../messages/ja-JP.json'
import zhCN from '../../messages/zh-CN.json'

export const localeStore = createLocaleStore()

const getMessage = core.i18n.createMessageGetter({
  'zh-CN': zhCN,
  'en-US': enUS,
  'ja-JP': jaJP,
})

export function desktopM(key: keyof typeof zhCN, params?: Record<string, string | number | boolean>): string {
  return getMessage(key, { locale: localeStore.current, params })
}
