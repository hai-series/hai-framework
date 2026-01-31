<!--
  @component ThemeSelector
  主题选择器组件，支持 FlyonUI 所有 17 个主题的选择和预览。

  @prop {string} currentTheme - 当前主题
  @prop {function} onchange - 主题变更回调
  @prop {boolean} showPreview - 是否显示主题预览
  @prop {boolean} grouped - 是否按分组显示

  @example
  <ThemeSelector 
    currentTheme={$theme}
    onchange={(theme) => setTheme(theme)}
    showPreview
    grouped
  />
-->
<script lang='ts'>
  import { cn } from '../../utils.js'
  import { THEMES, THEME_GROUPS, type ThemeInfo } from '../../theme-config.js'

  interface Props {
    currentTheme?: string
    /** 选择主题按钮的 aria-label */
    selectLabel?: string
    onchange?: (theme: string) => void
    showPreview?: boolean
    grouped?: boolean
    class?: string
  }

  let {
    currentTheme = 'light',
    selectLabel = 'Select theme',
    onchange,
    showPreview = true,
    grouped = true,
    class: className = '',
  }: Props = $props()

  let open = $state(false)
  let containerRef = $state<HTMLDivElement | null>(null)

  const currentInfo = $derived(
    THEMES.find(t => t.id === currentTheme) ?? THEMES[0]
  )

  function selectTheme(themeId: string) {
    onchange?.(themeId)
    open = false
  }

  function renderThemePreview(theme: ThemeInfo) {
    return `
      background: ${theme.bgColor};
      border-color: ${theme.primaryColor};
    `
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
    class='btn btn-ghost gap-2'
    onclick={() => (open = !open)}
    aria-label={selectLabel}
  >
    <!-- 当前主题预览 -->
    {#if showPreview}
      <div
        class='w-5 h-5 rounded-md border-2'
        style={renderThemePreview(currentInfo)}
      ></div>
    {/if}
    <span class='text-sm'>{currentInfo.name}</span>
    <!-- 下拉箭头 -->
    <svg xmlns='http://www.w3.org/2000/svg' class='h-4 w-4' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'>
      <path stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7' />
    </svg>
  </button>

  {#if open}
    <!-- 主题列表 -->
    <div class='dropdown-content bg-base-100 rounded-box shadow-xl border border-base-content/10 z-50 w-72 p-3 max-h-96 overflow-y-auto'>
      {#if grouped}
        <!-- 分组显示 -->
        {#each THEME_GROUPS as group}
          <div class='mb-3 last:mb-0'>
            <div class='text-xs font-semibold text-base-content/50 uppercase tracking-wider px-2 mb-2'>
              {group.name}
            </div>
            <div class='grid grid-cols-2 gap-1.5'>
              {#each group.themes as theme (theme.id)}
                <button
                  type='button'
                  class={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors',
                    theme.id === currentTheme
                      ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                      : 'hover:bg-base-200'
                  )}
                  onclick={() => selectTheme(theme.id)}
                >
                  <!-- 主题预览色块 -->
                  <div
                    class='w-4 h-4 rounded border flex-shrink-0'
                    style={renderThemePreview(theme)}
                  ></div>
                  <!-- 主题名称 -->
                  <span class='text-sm truncate'>{theme.name}</span>
                  <!-- 暗色主题标识 -->
                  {#if theme.dark}
                    <svg xmlns='http://www.w3.org/2000/svg' class='h-3 w-3 text-base-content/40 ml-auto flex-shrink-0' viewBox='0 0 24 24' fill='currentColor'>
                      <path d='M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z' />
                    </svg>
                  {/if}
                  <!-- 选中标记 -->
                  {#if theme.id === currentTheme}
                    <svg xmlns='http://www.w3.org/2000/svg' class='h-4 w-4 text-primary ml-auto flex-shrink-0' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'>
                      <path stroke-linecap='round' stroke-linejoin='round' d='M5 13l4 4L19 7' />
                    </svg>
                  {/if}
                </button>
              {/each}
            </div>
          </div>
        {/each}
      {:else}
        <!-- 平铺显示 -->
        <div class='grid grid-cols-2 gap-1.5'>
          {#each THEMES as theme (theme.id)}
            <button
              type='button'
              class={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors',
                theme.id === currentTheme
                  ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                  : 'hover:bg-base-200'
              )}
              onclick={() => selectTheme(theme.id)}
            >
              <div
                class='w-4 h-4 rounded border flex-shrink-0'
                style={renderThemePreview(theme)}
              ></div>
              <span class='text-sm truncate'>{theme.name}</span>
              {#if theme.dark}
                <svg xmlns='http://www.w3.org/2000/svg' class='h-3 w-3 text-base-content/40 ml-auto flex-shrink-0' viewBox='0 0 24 24' fill='currentColor'>
                  <path d='M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z' />
                </svg>
              {/if}
              {#if theme.id === currentTheme}
                <svg xmlns='http://www.w3.org/2000/svg' class='h-4 w-4 text-primary ml-auto flex-shrink-0' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'>
                  <path stroke-linecap='round' stroke-linejoin='round' d='M5 13l4 4L19 7' />
                </svg>
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>
