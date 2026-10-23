/** 移动端无刷新切换语言，保持认证会话并同步页面与 UI 组件。 */
import { getLocale, setLocale } from '$lib/paraglide/runtime.js'
import { createLocaleStore } from '@h-ai/ui/i18n'

export const localeStore = createLocaleStore({ defaultLocale: getLocale(), detectBrowser: false })

export function changeLocale(language: string): void {
  if (!localeStore.isSupported(language))
    return
  localeStore.set(language)
  setLocale(localeStore.current as Parameters<typeof setLocale>[0], { reload: false })
}
