<!--
  @component LanguageSwitch
  语言切换下拉组件，支持多语言切换。

  @prop {string} currentLanguage - 当前语言代码（BCP 47 格式，如 'zh-CN', 'en-US'）
  @prop {Language[]} languages - 可选语言列表
  @prop {function} onchange - 语言变更回调，传入选中的语言代码

  @example
  ```svelte
  <script>
    import { setLocale, getLocale } from '$lib/paraglide/runtime.js'
  </script>
  
  <LanguageSwitch 
    currentLanguage={getLocale()}
    languages={[
      { value: 'zh-CN', label: '简体中文' },
      { value: 'en-US', label: 'English' }
    ]}
    onchange={(lang) => setLocale(lang)}
  />
  ```
-->
<script lang='ts'>
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
      { value: 'zh-CN', label: '简体中文', flag: '🇨🇳' },
      { value: 'en-US', label: 'English', flag: '🇺🇸' },
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
  <button
    type='button'
    class='btn btn-ghost btn-sm gap-1'
    onclick={() => (open = !open)}
    aria-label='Switch language'
  >
    <svg xmlns='http://www.w3.org/2000/svg' class='h-4 w-4' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'>
      <path d='M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129' />
    </svg>
    {#if currentLangInfo?.flag}
      <span>{currentLangInfo.flag}</span>
    {/if}
    <span class='text-sm'>{currentLangInfo?.label ?? currentLanguage}</span>
    <svg xmlns='http://www.w3.org/2000/svg' class='h-3 w-3' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'>
      <path d='M19 9l-7 7-7-7' />
    </svg>
  </button>

  {#if open}
    <ul class='dropdown-content menu bg-base-100 rounded-box shadow-lg border border-base-content/10 z-50 w-44 p-2'>
      {#each languages as lang (lang.value)}
        <li>
          <button
            type='button'
            class='flex items-center gap-2 {lang.value === currentLanguage ? "active" : ""}'
            onclick={() => selectLanguage(lang.value)}
          >
            {#if lang.flag}
              <span>{lang.flag}</span>
            {/if}
            <span>{lang.label}</span>
            {#if lang.value === currentLanguage}
              <svg xmlns='http://www.w3.org/2000/svg' class='h-4 w-4 ml-auto' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'>
                <path d='M5 13l4 4L19 7' />
              </svg>
            {/if}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>
