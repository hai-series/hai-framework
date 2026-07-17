<script lang='ts'>
  // 全局布局：主题（深/浅）与语言（中/英）切换，并在挂载时恢复用户偏好
  import { browser } from '$app/environment'
  import * as m from '$lib/paraglide/messages.js'
  import { getLocale, setLocale } from '$lib/paraglide/runtime.js'
  import { applyTheme, getSavedTheme, LanguageSwitch, setGlobalLocale, ThemeSelector } from '@h-ai/ui'
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

  function handleLanguageChange(language: string) {
    setGlobalLocale(language)
    setLocale(language as 'zh-CN' | 'en-US')
    currentLanguage = language
  }

  $effect(() => {
    if (!browser)
      return
    currentTheme = getSavedTheme()
    applyTheme(currentTheme, false)
    currentLanguage = getLocale()
    setGlobalLocale(currentLanguage)
  })
</script>

<header class='sticky top-0 z-20 border-b border-base-content/8 bg-base-100/82 backdrop-blur-xl'>
  <div class='mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 lg:px-8'>
    <div class='flex items-center gap-3'>
      <div class='grid size-10 place-items-center rounded-2xl bg-primary text-primary-content shadow-lg shadow-primary/20'>
        <span class='icon-[tabler--sparkles] size-5'></span>
      </div>
      <div>
        <div class='font-semibold tracking-tight'>{m.app_name()}</div>
        <div class='text-xs text-base-content/50'>{m.app_tagline()}</div>
      </div>
    </div>
    <div class='flex items-center gap-2'>
      <LanguageSwitch currentLanguage={currentLanguage} onchange={handleLanguageChange} compact />
      <ThemeSelector currentTheme={currentTheme} onchange={handleThemeChange} showPreview compact grouped={false} />
    </div>
  </div>
</header>

{@render children()}
