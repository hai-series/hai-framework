<!--
  系统设置页面
  - 外观设置：主题选择
  - 区域设置：语言
  - 系统信息
-->
<script lang="ts">
  import type { PageData } from './$types'
  import { getThemeFontUrl } from '@h-ai/ui'
  import { core } from '@h-ai/core'
  import { browser } from '$app/environment'
  import { setLocale, getLocale } from '$lib/paraglide/runtime.js'
  import * as m from '$lib/paraglide/messages.js'
  
  interface Props {
    data: PageData
  }

  let { data }: Props = $props()

  // ========== 主题设置 ==========
  let currentTheme = $state(browser ? document.documentElement.getAttribute('data-theme') ?? 'light' : 'light')
  
  // 处理主题变更
  function handleThemeChange(theme: string) {
    if (browser) {
      document.documentElement.setAttribute('data-theme', theme)
      localStorage.setItem('theme', theme)
      currentTheme = theme
      
      // 加载主题字体
      const fontUrl = getThemeFontUrl(theme)
      if (fontUrl) {
        loadFont(fontUrl)
      }
    }
  }
  
  // 动态加载字体
  function loadFont(url: string) {
    const existingLink = document.querySelector(`link[href="${url}"]`)
    if (existingLink) return
    
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = url
    document.head.appendChild(link)
  }

  // ========== 语言设置 ==========
  const languages = [
    { value: 'zh-CN', label: '简体中文', flag: 'CN' },
    { value: 'en-US', label: 'English', flag: 'US' },
  ]
  
  let currentLanguage = $state(browser ? getLocale() : 'zh-CN')
  
  function handleLanguageChange(lang: string) {
    if (!browser) return
    if (lang === getLocale()) return
    // 同步到 @h-ai/core 全局 locale（影响所有模块的错误消息等）
    core.i18n.setGlobalLocale(lang)
    // setLocale 会设置 cookie 并刷新页面（Paraglide UI 翻译）
    setLocale(lang as 'zh-CN' | 'en-US')
  }

  // ========== 初始化 ==========
  $effect(() => {
    if (browser) {
      // 主题初始化
      const savedTheme = localStorage.getItem('theme')
      if (savedTheme) {
        currentTheme = savedTheme
        document.documentElement.setAttribute('data-theme', savedTheme)
        const fontUrl = getThemeFontUrl(savedTheme)
        if (fontUrl) loadFont(fontUrl)
      }
      
      // 语言从 Paraglide getLocale() 获取
      currentLanguage = getLocale()
    }
  })
</script>

<svelte:head>
  <title>{m.settings_title()} - {m.app_title()}</title>
</svelte:head>

<div class="space-y-6">
  <!-- 页面标题 -->
  <PageHeader title={m.settings_title()} description={m.settings_subtitle()} />

  <!-- 外观设置 -->
  <section>
    <h2 class="text-lg font-semibold text-base-content mb-4">{m.settings_appearance()}</h2>
    <Card>
      <div class="p-5">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <svg class="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4.098 19.902a3.75 3.75 0 005.304 0l6.401-6.402M6.75 21A3.75 3.75 0 013 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 003.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008z" />
              </svg>
            </div>
            <div>
              <p class="font-medium text-base-content">{m.settings_theme()}</p>
              <p class="text-sm text-base-content/50 mt-0.5">{m.settings_theme_desc()}</p>
            </div>
          </div>
          <ThemeSelector
            {currentTheme}
            onchange={handleThemeChange}
            showPreview
            grouped
          />
        </div>
      </div>
    </Card>
  </section>

  <!-- 区域设置 -->
  <section>
    <h2 class="text-lg font-semibold text-base-content mb-4">{m.settings_region()}</h2>
    <Card>
      <div class="p-5">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 rounded-xl bg-info/10 flex items-center justify-center shrink-0">
              <svg class="w-5 h-5 text-info" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802" />
              </svg>
            </div>
            <div>
              <p class="font-medium text-base-content">{m.settings_language()}</p>
              <p class="text-sm text-base-content/50 mt-0.5">{m.settings_language_desc()}</p>
            </div>
          </div>
          <LanguageSwitch
            {currentLanguage}
            {languages}
            onchange={handleLanguageChange}
          />
        </div>
      </div>
    </Card>
  </section>

  <!-- 系统信息 -->
  <section>
    <h2 class="text-lg font-semibold text-base-content mb-4">{m.settings_about()}</h2>
    <Card>
      <div class="p-5">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center shrink-0">
              <svg class="w-5 h-5 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
              </svg>
            </div>
            <div>
              <p class="text-sm text-base-content/50">{m.settings_system_name()}</p>
              <p class="text-base font-semibold text-base-content mt-0.5">{m.app_title()}</p>
            </div>
          </div>
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center shrink-0">
              <svg class="w-5 h-5 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 6h.008v.008H6V6z" />
              </svg>
            </div>
            <div>
              <p class="text-sm text-base-content/50">{m.settings_version()}</p>
              <p class="text-base font-semibold text-base-content mt-0.5">
                0.1.0
                <Badge variant="warning" size="sm" class="ml-2">{m.settings_version_dev()}</Badge>
              </p>
            </div>
          </div>
        </div>
      </div>
    </Card>
  </section>
</div>
