<!--
  系统设置页面
  - 外观设置：主题选择
  - 区域设置：语言
  - 系统信息
-->
<script lang="ts">
  import { applyTheme, getCurrentTheme, getSavedTheme, setGlobalLocale } from '@h-ai/ui'
  import { browser } from '$app/environment'
  import { setLocale, getLocale } from '$lib/paraglide/runtime.js'
  import * as m from '$lib/paraglide/messages.js'

  // ========== 主题设置 ==========
  let currentTheme = $state(browser ? getCurrentTheme() : 'light')
  
  // 处理主题变更
  function handleThemeChange(theme: string) {
    if (!browser) return
    applyTheme(theme)
    currentTheme = theme
  }

  // ========== 语言设置 ==========
  let currentLanguage = $state(browser ? getLocale() : 'zh-CN')
  
  function handleLanguageChange(lang: string) {
    if (!browser) return
    if (lang === getLocale()) return
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

<div class="space-y-5">
  <!-- 页面标题 -->
  <PageHeader title={m.settings_title()} description={m.settings_subtitle()} />

  <!-- 外观设置 -->
  <section>
    <h2 class="text-sm font-semibold text-base-content mb-3">{m.settings_appearance()}</h2>
    <Card>
      <div class="p-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-lg bg-primary/8 flex items-center justify-center shrink-0">
              <span class="icon-[tabler--palette] size-4.5 text-primary"></span>
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
    <h2 class="text-sm font-semibold text-base-content mb-3">{m.settings_region()}</h2>
    <Card>
      <div class="p-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-lg bg-info/8 flex items-center justify-center shrink-0">
              <span class="icon-[tabler--language] size-4.5 text-info"></span>
            </div>
            <div>
              <p class="font-medium text-base-content">{m.settings_language()}</p>
              <p class="text-sm text-base-content/50 mt-0.5">{m.settings_language_desc()}</p>
            </div>
          </div>
          <LanguageSwitch
            {currentLanguage}
            onchange={handleLanguageChange}
          />
        </div>
      </div>
    </Card>
  </section>

  <!-- 系统信息 -->
  <section>
    <h2 class="text-sm font-semibold text-base-content mb-3">{m.settings_about()}</h2>
    <Card>
      <div class="p-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-lg bg-success/8 flex items-center justify-center shrink-0">
              <span class="icon-[tabler--package] size-4.5 text-success"></span>
            </div>
            <div>
              <p class="text-sm text-base-content/50">{m.settings_system_name()}</p>
              <p class="text-base font-semibold text-base-content mt-0.5">{m.app_title()}</p>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-lg bg-warning/8 flex items-center justify-center shrink-0">
              <span class="icon-[tabler--tag] size-4.5 text-warning"></span>
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
