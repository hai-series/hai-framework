<!--
  系统设置页面
  - 外观设置：主题选择
  - 区域设置：语言
  - 系统信息
-->
<script lang='ts'>
  import { browser } from '$app/environment'
  import * as m from '$lib/paraglide/messages.js'
  import { getLocale, setLocale } from '$lib/paraglide/runtime.js'
  import { applyTheme, getCurrentTheme, getSavedTheme, setGlobalLocale } from '@h-ai/ui'

  // ========== 分区导航 ==========
  let activeSection = $state('appearance')

  // ========== 主题设置 ==========
  let currentTheme = $state(browser ? getCurrentTheme() : 'light')

  // 处理主题变更
  function handleThemeChange(theme: string) {
    if (!browser)
      return
    applyTheme(theme)
    currentTheme = theme
  }

  // ========== 语言设置 ==========
  let currentLanguage = $state(browser ? getLocale() : 'zh-CN')

  function handleLanguageChange(lang: string) {
    if (!browser)
      return
    if (lang === getLocale())
      return
    // 同步到全局 locale（经 @h-ai/ui 转发，影响核心模块错误消息等）
    setGlobalLocale(lang)
    // setLocale 会设置 cookie 并触发页面语言切换（Paraglide UI 翻译）
    setLocale(lang as 'zh-CN' | 'en-US')
  }

  // ========== 初始化 ==========
  $effect(() => {
    if (browser) {
      // 主题初始化
      const savedTheme = getSavedTheme()
      applyTheme(savedTheme, false)
      currentTheme = savedTheme

      // 语言从 Paraglide getLocale() 获取
      currentLanguage = getLocale()
    }
  })
</script>

<svelte:head>
  <title>{m.settings_title()} - {m.app_title()}</title>
</svelte:head>

<SettingsLayout
  title={m.settings_title()}
  description={m.settings_subtitle()}
  sections={[
    { id: 'appearance', label: m.settings_appearance(), icon: 'icon-[tabler--palette]' },
    { id: 'region', label: m.settings_region(), icon: 'icon-[tabler--language]' },
    { id: 'about', label: m.settings_about(), icon: 'icon-[tabler--info-circle]' },
  ]}
  active={activeSection}
  onselect={id => (activeSection = id)}
>
  {#if activeSection === 'appearance'}
    <!-- 外观设置（shadcn 风格：无卡片，分隔线 + 行） -->
    <section>
      <h2 class='text-lg font-medium text-base-content'>{m.settings_appearance()}</h2>
      <p class='mt-1 text-sm text-base-content/50'>{m.settings_theme_desc()}</p>
      <div class='mt-5 border-t border-base-content/8'></div>
      <div class='flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <p class='font-medium text-base-content'>{m.settings_theme()}</p>
          <p class='mt-1 text-sm text-base-content/50'>{m.settings_theme_desc()}</p>
        </div>
        <ThemeSelector
          {currentTheme}
          onchange={handleThemeChange}
          showPreview
          grouped
        />
      </div>
    </section>
  {:else if activeSection === 'region'}
    <!-- 区域设置 -->
    <section>
      <h2 class='text-lg font-medium text-base-content'>{m.settings_region()}</h2>
      <p class='mt-1 text-sm text-base-content/50'>{m.settings_language_desc()}</p>
      <div class='mt-5 border-t border-base-content/8'></div>
      <div class='flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <p class='font-medium text-base-content'>{m.settings_language()}</p>
          <p class='mt-1 text-sm text-base-content/50'>{m.settings_language_desc()}</p>
        </div>
        <LanguageSwitch
          {currentLanguage}
          onchange={handleLanguageChange}
        />
      </div>
    </section>
  {:else if activeSection === 'about'}
    <!-- 系统信息 -->
    <section>
      <h2 class='text-lg font-medium text-base-content'>{m.settings_about()}</h2>
      <p class='mt-1 text-sm text-base-content/50'>{m.settings_system_name()}</p>
      <div class='mt-5 border-t border-base-content/8'></div>
      <dl class='divide-y divide-base-content/8'>
        <div class='flex items-center justify-between py-4'>
          <dt class='text-sm text-base-content/55'>{m.settings_system_name()}</dt>
          <dd class='text-sm font-medium text-base-content'>{m.app_title()}</dd>
        </div>
        <div class='flex items-center justify-between py-4'>
          <dt class='text-sm text-base-content/55'>{m.settings_version()}</dt>
          <dd class='flex items-center gap-2 text-sm font-medium text-base-content'>
            0.1.0
            <Badge variant='warning' size='sm'>{m.settings_version_dev()}</Badge>
          </dd>
        </div>
      </dl>
    </section>
  {/if}
</SettingsLayout>
