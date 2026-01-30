<!--
  @component LanguageSwitch
  语言切换下拉组件，支持多语言切换。

  @prop {string} currentLanguage - 当前语言代码
  @prop {Language[]} languages - 可选语言列表
  @prop {function} onchange - 语言变更回调

  @example
  <LanguageSwitch 
    currentLanguage={$locale}
    languages={[
      { value: 'zh-cn', label: '简体中文' },
      { value: 'en-us', label: 'English' }
    ]}
    onchange={(lang) => locale.set(lang)}
  />
-->
<script lang='ts'>
  interface Language {
    value: string
    label: string
  }

  interface Props {
    currentLanguage?: string
    languages?: Language[]
    onchange?: (lang: string) => void
    class?: string
  }

  let {
    currentLanguage = 'zh-cn',
    languages = [
      { value: 'zh-cn', label: '简体中文' },
      { value: 'en-us', label: 'English' },
    ],
    onchange,
    class: className = '',
  }: Props = $props()

  let open = $state(false)

  const currentLabel = $derived(
    languages.find(l => l.value === currentLanguage)?.label ?? currentLanguage
  )

  function selectLanguage(lang: string) {
    onchange?.(lang)
    open = false
  }
</script>

<div class='dropdown dropdown-end {open ? "dropdown-open" : ""} {className}'>
  <button
    type='button'
    class='btn btn-ghost btn-sm gap-1'
    onclick={() => (open = !open)}
    aria-label='切换语言'
  >
    <svg xmlns='http://www.w3.org/2000/svg' class='h-4 w-4' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'>
      <path d='M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129' />
    </svg>
    <span class='text-sm'>{currentLabel}</span>
    <svg xmlns='http://www.w3.org/2000/svg' class='h-3 w-3' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'>
      <path d='M19 9l-7 7-7-7' />
    </svg>
  </button>

  {#if open}
    <button
      type='button'
      class='fixed inset-0 z-40 cursor-default bg-transparent'
      onclick={() => (open = false)}
      aria-label='关闭语言菜单'
      tabindex='-1'
    ></button>
    <ul class='dropdown-content menu bg-base-100 rounded-box shadow-lg border border-base-content/10 z-50 w-40 p-2'>
      {#each languages as lang (lang.value)}
        <li>
          <button
            type='button'
            class='flex items-center gap-2 {lang.value === currentLanguage ? "active" : ""}'
            onclick={() => selectLanguage(lang.value)}
          >
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
