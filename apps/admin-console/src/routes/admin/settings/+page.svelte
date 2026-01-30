<!--
  系统设置页面
  - 外观设置：主题选择（支持 17 个 FlyonUI 主题）
  - 区域设置：时区、语言
  - 系统信息
  
  使用 @hai/ui 组件和语义化颜色
-->
<script lang="ts">
  import type { PageData } from './$types'
  import { Card, ThemeSelector, LanguageSwitch, getThemeInfo, getThemeFontUrl } from '@hai/ui'
  import { browser } from '$app/environment'
  
  interface Props {
    data: PageData
  }

  let { data }: Props = $props()

  // ========== 主题设置 ==========
  let currentTheme = $state(browser ? document.documentElement.getAttribute('data-theme') ?? 'light' : 'light')
  
  // 当前主题信息
  const currentThemeInfo = $derived(getThemeInfo(currentTheme))

  // 处理主题变更
  function handleThemeChange(theme: string) {
    currentTheme = theme
    if (browser) {
      document.documentElement.setAttribute('data-theme', theme)
      localStorage.setItem('theme', theme)
      
      // 加载主题字体
      const fontUrl = getThemeFontUrl(theme)
      if (fontUrl) {
        loadFont(fontUrl)
      }
    }
  }
  
  // 动态加载字体
  function loadFont(url: string) {
    // 检查是否已加载
    const existingLink = document.querySelector(`link[href="${url}"]`)
    if (existingLink) return
    
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = url
    document.head.appendChild(link)
  }

  // ========== 语言设置 ==========
  const languages = [
    { value: 'zh-cn', label: '简体中文' },
    { value: 'en-us', label: 'English' },
  ]
  let currentLanguage = $state('zh-cn')
  
  function handleLanguageChange(lang: string) {
    currentLanguage = lang
    if (browser) {
      localStorage.setItem('locale', lang)
    }
  }

  // ========== 时区设置 ==========
  const timezones = [
    { value: 'Asia/Shanghai', label: '中国标准时间 (UTC+8)', city: '上海' },
    { value: 'America/New_York', label: '美国东部时间 (UTC-5)', city: '纽约' },
    { value: 'America/Los_Angeles', label: '美国太平洋时间 (UTC-8)', city: '洛杉矶' },
    { value: 'Europe/London', label: '格林威治时间 (UTC+0)', city: '伦敦' },
    { value: 'Europe/Paris', label: '中欧时间 (UTC+1)', city: '巴黎' },
    { value: 'Asia/Tokyo', label: '日本标准时间 (UTC+9)', city: '东京' },
    { value: 'Asia/Singapore', label: '新加坡时间 (UTC+8)', city: '新加坡' },
    { value: 'Australia/Sydney', label: '澳大利亚东部时间 (UTC+10)', city: '悉尼' },
  ]
  let currentTimezone = $state('Asia/Shanghai')
  
  function handleTimezoneChange(event: Event) {
    const select = event.target as HTMLSelectElement
    currentTimezone = select.value
    if (browser) {
      localStorage.setItem('timezone', currentTimezone)
    }
  }

  // ========== 初始化 ==========
  $effect(() => {
    if (browser) {
      // 恢复主题
      const savedTheme = localStorage.getItem('theme')
      if (savedTheme) {
        currentTheme = savedTheme
        document.documentElement.setAttribute('data-theme', savedTheme)
        const fontUrl = getThemeFontUrl(savedTheme)
        if (fontUrl) loadFont(fontUrl)
      }
      
      // 恢复语言
      const savedLocale = localStorage.getItem('locale')
      if (savedLocale) {
        currentLanguage = savedLocale
      }
      
      // 恢复时区
      const savedTimezone = localStorage.getItem('timezone')
      if (savedTimezone) {
        currentTimezone = savedTimezone
      }
    }
  })
</script>

<svelte:head>
  <title>系统设置 - hai Admin</title>
</svelte:head>

<div class="space-y-6 max-w-4xl">
  <!-- 页面标题 -->
  <div>
    <h1 class="text-2xl font-bold text-base-content">系统设置</h1>
    <p class="text-base-content/60 mt-1">个性化您的系统外观和区域偏好</p>
  </div>

  <!-- 外观设置 -->
  <Card>
    <div class="p-6">
      <div class="flex items-center gap-3 mb-6">
        <div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <svg class="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
          </svg>
        </div>
        <div>
          <h2 class="text-lg font-semibold text-base-content">外观设置</h2>
          <p class="text-sm text-base-content/60">选择您喜欢的界面主题风格</p>
        </div>
      </div>
      
      <!-- 主题选择 -->
      <div class="bg-base-200/50 rounded-xl p-5">
        <div class="flex items-center justify-between mb-4">
          <div>
            <p class="font-medium text-base-content">界面主题</p>
            <p class="text-sm text-base-content/60 mt-0.5">
              当前：{currentThemeInfo?.name ?? currentTheme}
              {#if currentThemeInfo?.dark}
                <span class="badge badge-sm badge-neutral ml-2">暗色</span>
              {:else}
                <span class="badge badge-sm badge-ghost ml-2">亮色</span>
              {/if}
            </p>
          </div>
          <ThemeSelector
            {currentTheme}
            onchange={handleThemeChange}
            showPreview
            grouped
          />
        </div>
        
        <!-- 主题预览 -->
        <div class="mt-4 p-4 rounded-lg border border-base-content/10 bg-base-100">
          <p class="text-xs text-base-content/50 mb-3">主题预览</p>
          <div class="flex flex-wrap gap-2">
            <div class="badge badge-primary">Primary</div>
            <div class="badge badge-secondary">Secondary</div>
            <div class="badge badge-accent">Accent</div>
            <div class="badge badge-success">Success</div>
            <div class="badge badge-warning">Warning</div>
            <div class="badge badge-error">Error</div>
            <div class="badge badge-info">Info</div>
          </div>
          <div class="flex gap-2 mt-3">
            <button class="btn btn-sm btn-primary">Primary</button>
            <button class="btn btn-sm btn-secondary">Secondary</button>
            <button class="btn btn-sm btn-accent">Accent</button>
          </div>
        </div>
      </div>
    </div>
  </Card>

  <!-- 区域设置 -->
  <Card>
    <div class="p-6">
      <div class="flex items-center gap-3 mb-6">
        <div class="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center">
          <svg class="w-5 h-5 text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <h2 class="text-lg font-semibold text-base-content">区域设置</h2>
          <p class="text-sm text-base-content/60">配置语言和时区偏好</p>
        </div>
      </div>
      
      <div class="space-y-4">
        <!-- 语言选择 -->
        <div class="flex items-center justify-between p-4 bg-base-200/50 rounded-xl">
          <div>
            <p class="font-medium text-base-content">界面语言</p>
            <p class="text-sm text-base-content/60 mt-0.5">设置系统显示语言</p>
          </div>
          <LanguageSwitch 
            {currentLanguage}
            {languages}
            onchange={handleLanguageChange}
          />
        </div>
        
        <!-- 时区选择 -->
        <div class="flex items-center justify-between p-4 bg-base-200/50 rounded-xl">
          <div>
            <p class="font-medium text-base-content">时区</p>
            <p class="text-sm text-base-content/60 mt-0.5">影响日期和时间的显示</p>
          </div>
          <select 
            class="select select-bordered select-sm w-64"
            value={currentTimezone}
            onchange={handleTimezoneChange}
          >
            {#each timezones as tz}
              <option value={tz.value}>{tz.city} - {tz.label}</option>
            {/each}
          </select>
        </div>
      </div>
    </div>
  </Card>

  <!-- 系统信息 -->
  <Card>
    <div class="p-6">
      <div class="flex items-center gap-3 mb-6">
        <div class="w-10 h-10 rounded-lg bg-info/10 flex items-center justify-center">
          <svg class="w-5 h-5 text-info" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <h2 class="text-lg font-semibold text-base-content">系统信息</h2>
          <p class="text-sm text-base-content/60">关于此系统的基本信息</p>
        </div>
      </div>
      
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="stat bg-base-200/50 rounded-xl">
          <div class="stat-title">系统名称</div>
          <div class="stat-value text-lg">hai Admin</div>
          <div class="stat-desc">管理控制台</div>
        </div>
        <div class="stat bg-base-200/50 rounded-xl">
          <div class="stat-title">版本</div>
          <div class="stat-value text-lg">0.1.0</div>
          <div class="stat-desc">开发版本</div>
        </div>
        <div class="stat bg-base-200/50 rounded-xl">
          <div class="stat-title">UI 框架</div>
          <div class="stat-value text-lg">FlyonUI</div>
          <div class="stat-desc">Tailwind CSS 组件库</div>
        </div>
      </div>
    </div>
  </Card>
</div>
