<!--
  @component ThemeSelector
  主题选择器组件，支持内置主题集合的选择和预览。

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
  import { cn } from '../../../utils.js'
  import { uiM } from '../../../messages.js'
  import { THEMES, THEME_GROUPS, type ThemeInfo } from '../../../theme-config.js'
  import BareButton from '../../primitives/BareButton.svelte'

  interface Props {
    currentTheme?: string
    /** 选择主题按钮的 aria-label */
    selectLabel?: string
    onchange?: (theme: string) => void
    showPreview?: boolean
    /** 紧凑模式：仅显示预览色块，适用于移动端头部 */
    compact?: boolean
    grouped?: boolean
    class?: string
  }

  let {
    currentTheme = 'light',
    selectLabel,
    onchange,
    showPreview = true,
    compact = false,
    grouped = true,
    class: className = '',
  }: Props = $props()

  const displaySelectLabel = $derived(selectLabel ?? uiM('theme_selector_label'))

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
  <BareButton
    type='button'
    class='btn btn-ghost {compact ? "btn-sm btn-square" : "gap-2"}'
    onclick={() => (open = !open)}
    ariaLabel={displaySelectLabel}
  >
    <!-- 当前主题预览 -->
    {#if showPreview}
      <div
        class='w-5 h-5 rounded-full border-2 shrink-0'
        style={renderThemePreview(currentInfo)}
      ></div>
    {/if}
    {#if !compact}
      <span class='text-sm'>{currentInfo.name}</span>
      <!-- 下拉箭头 -->
      <svg xmlns='http://www.w3.org/2000/svg' class='h-4 w-4' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'>
        <path stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7' />
      </svg>
    {/if}
  </BareButton>

  {#if open}
    <!-- 主题列表 -->
    <div class='dropdown-content bg-base-100 rounded-box shadow-xl border border-base-content/10 z-50 p-4 max-h-[80vh] overflow-y-auto {compact ? "w-56 right-0" : ""}'>
      {#if grouped}
        <!-- 分组显示 -->
        {#each THEME_GROUPS as group}
          <div class='mb-4 last:mb-0'>
            <div class='text-xs font-semibold text-base-content/50 uppercase tracking-wider px-2 mb-2'>
              {uiM(group.nameKey)}
            </div>
            <div class='flex flex-wrap gap-2'>
              {#each group.themes as theme (theme.id)}
                <BareButton
                  type='button'
                  class={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-lg text-left transition-colors w-28',
                    theme.id === currentTheme
                      ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                      : 'hover:bg-base-200'
                  )}
                  onclick={() => selectTheme(theme.id)}
                >
                  <!-- 主题预览色块 -->
                  <div
                    class='w-4 h-4 rounded border shrink-0'
                    style={renderThemePreview(theme)}
                  ></div>
                  <!-- 主题名称 -->
                  <span class='text-sm whitespace-nowrap'>{theme.name}</span>
                  <!-- 选中标记 -->
                  {#if theme.id === currentTheme}
                    <svg xmlns='http://www.w3.org/2000/svg' class='h-4 w-4 text-primary shrink-0' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'>
                      <path stroke-linecap='round' stroke-linejoin='round' d='M5 13l4 4L19 7' />
                    </svg>
                  {/if}
                </BareButton>
              {/each}
            </div>
          </div>
        {/each}
      {:else}
        <!-- 平铺显示 -->
        <div class='flex flex-wrap gap-2'>
          {#each THEMES as theme (theme.id)}
            <BareButton
              type='button'
              class={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg text-left transition-colors w-28',
                theme.id === currentTheme
                  ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                  : 'hover:bg-base-200'
              )}
              onclick={() => selectTheme(theme.id)}
            >
              <div
                class='w-4 h-4 rounded border shrink-0'
                style={renderThemePreview(theme)}
              ></div>
              <span class='text-sm whitespace-nowrap'>{theme.name}</span>
              {#if theme.id === currentTheme}
                <svg xmlns='http://www.w3.org/2000/svg' class='h-4 w-4 text-primary shrink-0' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'>
                  <path stroke-linecap='round' stroke-linejoin='round' d='M5 13l4 4L19 7' />
                </svg>
              {/if}
            </BareButton>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>
