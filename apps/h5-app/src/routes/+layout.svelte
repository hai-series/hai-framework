<script lang="ts">
  /**
   * H5 应用根布局 — 移动端底部 Tab 导航
   */
  import { browser } from '$app/environment'
  import '../app.css'
  import { getLocale, setLocale } from '$lib/paraglide/runtime.js'
  import * as m from '$lib/paraglide/messages.js'
  import { page } from '$app/stores'
  import { LanguageSwitch, ThemeSelector, applyTheme, getSavedTheme, setGlobalLocale } from '@h-ai/ui'

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

  const tabs = [
    { href: '/', label: m.tab_home, icon: 'icon-[tabler--home]' },
    { href: '/discover', label: m.tab_discover, icon: 'icon-[tabler--camera]' },
    { href: '/cart', label: m.tab_cart, icon: 'icon-[tabler--shopping-cart]' },
    { href: '/profile', label: m.tab_profile, icon: 'icon-[tabler--user]' },
  ]

  /** 认证页面不显示底部导航 */
  const isAuthPage = $derived($page.url.pathname.startsWith('/auth'))
</script>

{#if isAuthPage}
  {@render children()}
{:else}
  <div class="flex flex-col h-dvh max-w-lg mx-auto bg-base-100">
    <!-- 顶部导航栏 -->
    <header class="shrink-0 z-20 bg-base-100/95 backdrop-blur border-b border-base-200 px-4 h-11 flex items-center justify-between">
      <span class="text-sm font-bold truncate">{m.app_title()}</span>
      <div class="flex items-center">
        <LanguageSwitch currentLanguage={currentLanguage} onchange={handleLanguageChange} compact />
        <ThemeSelector currentTheme={currentTheme} onchange={handleThemeChange} showPreview compact grouped={false} />
      </div>
    </header>

    <!-- 页面内容区（可滚动） -->
    <main class="flex-1 overflow-y-auto overscroll-contain">
      {@render children()}
    </main>

    <!-- 底部 Tab 栏 -->
    <nav class="shrink-0 grid grid-cols-4 bg-base-100 border-t border-base-200 z-20" style="padding-bottom: env(safe-area-inset-bottom, 0px);">
      {#each tabs as tab}
        {@const active = tab.href === '/' ? $page.url.pathname === '/' : $page.url.pathname.startsWith(tab.href)}
        <a
          href={tab.href}
          class="flex flex-col items-center justify-center gap-0.5 py-2 transition-colors {active ? 'text-primary font-medium' : 'text-base-content/45'}"
        >
          <span class="{tab.icon} text-xl"></span>
          <span class="text-[10px] leading-tight">{tab.label()}</span>
        </a>
      {/each}
    </nav>
  </div>
{/if}
