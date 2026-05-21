<script lang='ts'>
  /**
   * H5 应用根布局 — 使用 @h-ai/ui AppBar + BottomNav 组件
   */
  import { browser } from '$app/environment'
  import { goto } from '$app/navigation'
  import { page } from '$app/stores'
  import * as m from '$lib/paraglide/messages.js'
  import { getLocale, setLocale } from '$lib/paraglide/runtime.js'
  import {
    AppBar,
    applyTheme,
    BottomNav,
    getSavedTheme,
    LanguageSwitch,
    setGlobalLocale,
    ThemeSelector,
  } from '@h-ai/ui'
  import '../app.css'

  interface Props {
    children: import('svelte').Snippet
  }

  const { children }: Props = $props()

  let currentTheme = $state('light')
  let currentLanguage = $state('zh-CN')

  function handleThemeChange(theme: string) {
    applyTheme(theme)
    currentTheme = theme
  }

  function handleLanguageChange(lang: string) {
    setGlobalLocale(lang)
    setLocale(lang as 'zh-CN' | 'en-US')
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
  const tabRoutes: Record<string, string> = {
    home: '/',
    discover: '/discover',
    cart: '/cart',
    profile: '/profile',
  }

  /** 当前激活的 tab ID */
  const activeTab = $derived(
    $page.url.pathname === '/'
      ? 'home'
      : Object.entries(tabRoutes).find(([, path]) => path !== '/' && $page.url.pathname.startsWith(path))?.[0] ?? 'home',
  )

  function handleTabChange(id: string) {
    const route = tabRoutes[id]
    if (route)
      goto(route)
  }

  /** 认证页面不显示导航 */
  const isAuthPage = $derived($page.url.pathname.startsWith('/auth'))
</script>

{#if isAuthPage}
  {@render children()}
{:else}
  <div class='hai-mobile-viewport'>
    <div class='hai-mobile-shell max-w-lg'>
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
          { id: 'home', label: m.tab_home(), iconClass: 'icon-[tabler--home]' },
          { id: 'discover', label: m.tab_discover(), iconClass: 'icon-[tabler--camera]' },
          { id: 'cart', label: m.tab_cart(), iconClass: 'icon-[tabler--shopping-cart]' },
          { id: 'profile', label: m.tab_profile(), iconClass: 'icon-[tabler--user]' },
        ]}
        active={activeTab}
        onchange={handleTabChange}
        safeArea
        centered
        maxWidth='lg'
        class='border-base-content/8 shadow-[0_-12px_32px_rgba(15,23,42,0.08)]'
      />
    </div>
  </div>
{/if}
