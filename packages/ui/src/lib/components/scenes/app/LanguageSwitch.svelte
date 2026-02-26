<!--
  @component LanguageSwitch
  语言切换下拉组件，支持多语言切换。

  @prop {string} currentLanguage - 当前语言代码（BCP 47 格式，如 'zh-CN', 'en-US'）
  @prop {Language[]} languages - 可选语言列表
  @prop {function} onchange - 语言变更回调，传入选中的语言代码

  @example
  ```svelte
  <script>
    import { LanguageSwitch, createLocaleStore, setGlobalLocale } from '@h-ai/ui'
    import { setLocale, getLocale } from '$lib/paraglide/runtime.js'
    
    const localeStore = createLocaleStore()
  </script>
  
  <LanguageSwitch 
    currentLanguage={localeStore.current}
    languages={[
      { value: 'zh-CN', label: '简体中文' },
      { value: 'en-US', label: 'English' }
    ]}
    onchange={(lang) => {
      localeStore.set(lang)  // 同步到 @h-ai/core 全局 locale
      setLocale(lang)        // 同步到 Paraglide
    }}
  />
  ```
-->
<script lang='ts'>
  import BareButton from '../../primitives/BareButton.svelte'
  import { m } from '../../../messages.js'
  interface Language {
    value: string
    label: string
    flag?: string
  }

  interface Props {
    /** 当前语言代码（BCP 47 格式） */
    currentLanguage?: string
    /** 可选语言列表 */
    languages?: Language[]
    /** 语言变更回调 */
    onchange?: (lang: string) => void
    /** 自定义类名 */
    class?: string
  }

  let {
    currentLanguage = 'zh-CN',
    languages = [
      { value: 'zh-CN', label: '简体中文', flag: 'CN' },
      { value: 'en-US', label: 'English', flag: 'US' },
    ],
    onchange,
    class: className = '',
  }: Props = $props()

  let open = $state(false)
  let containerRef = $state<HTMLDivElement | null>(null)

  const currentLangInfo = $derived(
    languages.find(l => l.value === currentLanguage)
  )

  function selectLanguage(lang: string) {
    if (lang !== currentLanguage) {
      onchange?.(lang)
    }
    open = false
  }

  function handleClickOutside(event: MouseEvent) {
    if (containerRef && !containerRef.contains(event.target as Node)) {
      open = false
    }
  }

  $effect(() => {
    if (open) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
    return undefined
  })
</script>

<div bind:this={containerRef} class='dropdown dropdown-end {open ? "dropdown-open" : ""} {className}'>
  <BareButton
    type='button'
    class='btn btn-ghost btn-sm gap-2 min-w-fit'
    onclick={() => (open = !open)}
    ariaLabel={m('language_switch_label')}
  >
    <svg xmlns='http://www.w3.org/2000/svg' class='h-4 w-4 shrink-0' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'>
      <path d='M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129' />
    </svg>
    {#if currentLangInfo?.flag}
      <span class='shrink-0 text-xs'>{currentLangInfo.flag}</span>
    {/if}
    <span class='text-sm whitespace-nowrap'>{currentLangInfo?.label ?? currentLanguage}</span>
    <svg xmlns='http://www.w3.org/2000/svg' class='h-4 w-4 shrink-0 opacity-50' viewBox='0 0 20 20' fill='currentColor'>
      <path fill-rule='evenodd' d='M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z' clip-rule='evenodd' />
    </svg>
  </BareButton>

  {#if open}
    <div class='dropdown-content bg-base-100 rounded-box shadow-lg border border-base-content/10 z-50 p-2'>
      {#each languages as lang (lang.value)}
        <BareButton
          type='button'
          class='flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left transition-colors whitespace-nowrap {lang.value === currentLanguage ? "bg-primary/10 text-primary" : "hover:bg-base-200"}'
          onclick={() => selectLanguage(lang.value)}
        >
          {#if lang.flag}
            <span class='shrink-0 text-xs font-medium text-base-content/60'>{lang.flag}</span>
          {/if}
          <span class='whitespace-nowrap'>{lang.label}</span>
          {#if lang.value === currentLanguage}
            <svg xmlns='http://www.w3.org/2000/svg' class='h-4 w-4 ml-auto shrink-0' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'>
              <path d='M5 13l4 4L19 7' />
            </svg>
          {/if}
        </BareButton>
      {/each}
    </div>
  {/if}
</div>
