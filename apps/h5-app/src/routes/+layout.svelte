<script lang='ts'>
  import type { LayoutData } from './$types'
  /**
   * H5 应用根布局 — 使用 @h-ai/ui AppBar + BottomNav 组件
   */
  import { browser } from '$app/env'
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import {
    AppBar,
    applyTheme,
    BottomNav,
    getSavedTheme,
    LanguageSwitch,
    setGlobalLocale,
    ThemeSelector,
  } from '@h-ai/ui'
  import * as m from '#lib/paraglide/messages.js'
  import { getLocale, setLocale } from '#lib/paraglide/runtime.js'
  import { authActions } from '#lib/services/auth.js'
  import '../app.css'

  interface Props {
    data: LayoutData
    children: import('svelte').Snippet
  }

  const { data, children }: Props = $props()
  $effect(() => authActions.bindPageExit({ enabled: data.iamPublicConfig?.session.endOnPageHide }))

  let currentTheme = $state('light')
  let currentLanguage = $state('zh-CN')

  type TabId = 'home' | 'discover' | 'cart' | 'profile'
  type TabRoute = ReturnType<typeof resolve>

  function handleThemeChange(theme: string) {
    applyTheme(theme)
    currentTheme = theme
  }

  function handleLanguageChange(lang: string) {
    setGlobalLocale(lang)
    setLocale(lang as 'zh-CN' | 'en-US' | 'ja-JP')
    currentLanguage = lang
  }

  $effect(() => {
    if (!browser)
      return
    const theme = getSavedTheme()
    applyTheme(theme, false)
    currentTheme = theme
    const lang = getLocale()
    setGlobalLocale(lang)
    currentLanguage = lang
  })

  /** 底部导航路由映射 */
  const tabRoutes: Record<TabId, TabRoute> = {
    home: resolve('/'),
    discover: resolve('discover'),
    cart: resolve('cart'),
    profile: resolve('profile'),
  }

  /** 当前激活的 tab ID */
  const activeTab = $derived(
    page.url.pathname === tabRoutes.home
      ? 'home'
      : Object.entries(tabRoutes).find(([, path]) => path !== tabRoutes.home && page.url.pathname.startsWith(path))?.[0] ?? 'home',
  )

  function handleTabChange(id: string) {
    if (!(id in tabRoutes)) {
      return
    }

    const route = tabRoutes[id as TabId]
    // eslint-disable-next-line svelte/no-navigation-without-resolve -- route 仅来自 resolve 构造且已核验键的导航映射，不能二次添加挂载前缀。
    void goto(route)
  }

  /** 认证页面不显示导航 */
  const isAuthPage = $derived(page.url.pathname.startsWith('/auth'))
</script>

{#if isAuthPage}
  {@render children()}
{:else}
  <div class='hai-mobile-viewport'>
    <div class='hai-mobile-shell min-w-0'>
      <!-- 顶部应用栏 -->
      <AppBar title={m.app_title()} safeArea fixed={false} class='bg-base-100/95 backdrop-blur border-base-content/8'>
        {#snippet trailing()}
          <div class='flex items-center gap-1'>
            <LanguageSwitch currentLanguage={currentLanguage} onchange={handleLanguageChange} compact />
            <ThemeSelector currentTheme={currentTheme} onchange={handleThemeChange} showPreview compact grouped={false} />
          </div>
        {/snippet}
      </AppBar>

      <!-- 页面内容区（可滚动） -->
      <main class='hai-mobile-main'>
        {@render children()}
      </main>

      <!-- 底部导航栏 -->
      <BottomNav
        items={[
          {
            id: 'home',
            label: m.tab_home(),
            iconClass: 'icon-[tabler--home]',
          },
          {
            id: 'discover',
            label: m.tab_discover(),
            iconClass: 'icon-[tabler--camera]',
          },
          {
            id: 'cart',
            label: m.tab_cart(),
            iconClass: 'icon-[tabler--shopping-cart]',
          },
          {
            id: 'profile',
            label: m.tab_profile(),
            iconClass: 'icon-[tabler--user]',
          },
        ]}
        active={activeTab}
        onchange={handleTabChange}
        safeArea
        centered
        maxWidth='none'
        class='border-base-content/8 shadow-[0_-12px_32px_rgba(15,23,42,0.08)]'
      />
    </div>
  </div>
{/if}
<ToastContainer />
