<!--
  系统设置页面
  - 外观设置：主题选择
  - 区域设置：语言
  - 系统信息
-->
<script lang="ts">
  import type { PageData } from './$types'
  import { getThemeFontUrl } from '@hai/ui'
  import { core } from '@hai/core'
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
    // 同步到 @hai/core 全局 locale（影响所有模块的错误消息等）
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

<div class="space-y-8">
  <!-- 页面标题 -->
  <div>
    <h1 class="text-2xl font-bold text-base-content">{m.settings_title()}</h1>
    <p class="text-base-content/60 mt-1">{m.settings_subtitle()}</p>
  </div>

  <!-- 外观设置 -->
  <section>
    <h2 class="text-lg font-semibold text-base-content mb-4">{m.settings_appearance()}</h2>
    
    <div class="space-y-4">
      <!-- 主题选择 -->
      <div class="flex items-center justify-between py-3">
        <div>
          <p class="font-medium text-base-content">{m.settings_theme()}</p>
          <p class="text-sm text-base-content/60">{m.settings_theme_desc()}</p>
        </div>
        <ThemeSelector
          {currentTheme}
          onchange={handleThemeChange}
          showPreview
          grouped
        />
      </div>
    </div>
  </section>

  <!-- 区域设置 -->
  <section>
    <h2 class="text-lg font-semibold text-base-content mb-4">{m.settings_region()}</h2>
    
    <div class="space-y-4">
      <!-- 语言选择 -->
      <div class="flex items-center justify-between py-3">
        <div>
          <p class="font-medium text-base-content">{m.settings_language()}</p>
          <p class="text-sm text-base-content/60">{m.settings_language_desc()}</p>
        </div>
        <LanguageSwitch
          {currentLanguage}
          {languages}
          onchange={handleLanguageChange}
        />
      </div>
    </div>
  </section>

  <!-- 系统信息 -->
  <section>
    <h2 class="text-lg font-semibold text-base-content mb-4">{m.settings_about()}</h2>
    
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <p class="text-sm text-base-content/60">{m.settings_system_name()}</p>
        <p class="text-lg font-semibold text-base-content">{m.app_title()}</p>
      </div>
      <div>
        <p class="text-sm text-base-content/60">{m.settings_version()}</p>
        <p class="text-lg font-semibold text-base-content">0.1.0 <span class="text-sm font-normal text-base-content/60">{m.settings_version_dev()}</span></p>
      </div>
    </div>
  </section>
</div>
