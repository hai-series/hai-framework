<script lang="ts">
  /**
   * H5 应用根布局 — 使用 @h-ai/ui AppBar + BottomNav 组件
   */
  import { browser } from '$app/environment'
  import '../app.css'
  import { getLocale, setLocale } from '$lib/paraglide/runtime.js'
  import * as m from '$lib/paraglide/messages.js'
  import { page } from '$app/stores'
  import { goto } from '$app/navigation'
  import {
    AppBar,
    BottomNav,
    LanguageSwitch,
    ThemeSelector,
    applyTheme,
    getSavedTheme,
    setGlobalLocale,
  } from '@h-ai/ui'

  interface Props {
    children: import('svelte').Snippet
  }

  let { children }: Props = $props()

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
  <div class="flex flex-col h-dvh max-w-lg mx-auto bg-base-100">
    <!-- 顶部应用栏 -->
    <AppBar title={m.app_title()} safeArea={false} fixed={false}>
      {#snippet trailing()}
        <div class="flex items-center">
          <LanguageSwitch currentLanguage={currentLanguage} onchange={handleLanguageChange} compact />
          <ThemeSelector currentTheme={currentTheme} onchange={handleThemeChange} showPreview compact grouped={false} />
        </div>
      {/snippet}
    </AppBar>

    <!-- 页面内容区（可滚动） -->
    <main class="flex-1 overflow-y-auto overscroll-contain">
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
      safeArea={false}
    />
  </div>
{/if}
