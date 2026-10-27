<!--
  @component ThemeSelector
  主题选择器组件，支持内置主题集合的选择和预览。

  @prop {string} currentTheme - 当前主题
  @prop {function} onchange - 主题变更回调
  @prop {boolean} showPreview - 是否显示主题预览
  @prop {boolean} grouped - 是否按分组显示

  @example
  ```ts
  import { mount, unmount } from 'svelte'
  import type { ComponentProps } from 'svelte'
  import { ThemeSelector } from '@h-ai/ui'
  const props: ComponentProps<typeof ThemeSelector> = { currentTheme: 'light', grouped: true }
  const component = mount(ThemeSelector, { target: document.body, props })
  await unmount(component)
  ```
-->
<script lang='ts'>
  import type { ThemeInfo } from '../../../theme-config.js'
  import type { DataAttributes } from '../../../types.js'
  import { tick } from 'svelte'
  import { uiM } from '../../../messages.js'
  import { THEME_GROUPS, THEMES } from '../../../theme-config.js'
  import { cn, getDataAttributes } from '../../../utils.js'

  /**
   * ThemeSelector 组件的属性契约；通过公开组件配置使用。
   *
   * @example
   * ```ts
   * import { mount, unmount } from 'svelte'
   * import type { ComponentProps } from 'svelte'
   * import { ThemeSelector } from '@h-ai/ui'
   * const props: ComponentProps<typeof ThemeSelector> = { currentTheme: 'light', grouped: true }
   * const component = mount(ThemeSelector, { target: document.body, props })
   * await unmount(component)
   * ```
   */
  interface Props {
    currentTheme?: string
    /** 选择主题按钮的 aria-label */
    selectLabel?: string
    onchange?: (theme: string) => void
    showPreview?: boolean
    /** 下拉菜单水平对齐方式 */
    align?: 'start' | 'end'
    /** 紧凑模式：仅显示预览色块，适用于移动端头部 */
    compact?: boolean
    grouped?: boolean
    class?: string
  }

  const {
    currentTheme = 'light',
    selectLabel,
    onchange,
    showPreview = true,
    align = 'end',
    compact = false,
    grouped = true,
    class: className = '',
    ...restProps
  }: Props & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
  const displaySelectLabel = $derived(selectLabel ?? uiM('theme_selector_label'))
  const menuId = $props.id()

  let open = $state(false)
  let containerRef = $state<HTMLDivElement | null>(null)

  const currentInfo = $derived(
    THEMES.find(t => t.id === currentTheme) ?? THEMES[0],
  )

  function selectTheme(themeId: string) {
    onchange?.(themeId)
    open = false
    containerRef?.querySelector('button')?.focus()
  }

  async function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      event.stopPropagation()
      open = false
      containerRef?.querySelector('button')?.focus()
      return
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key))
      return
    event.preventDefault()
    const opening = !open
    open = true
    await tick()
    const choices = [...containerRef?.querySelectorAll<HTMLButtonElement>('[data-theme-option]') ?? []]
    const current = choices.findIndex(button => button === document.activeElement)
    const selected = choices.findIndex(button => button.dataset.themeOption === currentTheme)
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1 : opening ? Math.max(0, selected) : (current + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length
    choices[index]?.focus()
  }

  function themeName(theme: ThemeInfo): string {
    return theme.id === 'high-contrast' ? uiM('theme_high_contrast') : theme.id === 'formal' ? uiM('theme_formal') : theme.name
  }

  function renderThemePreview(theme: ThemeInfo) {
    return `
      background: ${theme.bgColor};
      border-color: ${theme.primaryColor};
    `
  }

  function handleClickOutside(event: MouseEvent | FocusEvent) {
    if (containerRef && !containerRef.contains(event.target as Node)) {
      open = false
    }
  }

  $effect(() => {
    if (open) {
      document.addEventListener('click', handleClickOutside)
      document.addEventListener('focusin', handleClickOutside)
      return () => {
        document.removeEventListener('click', handleClickOutside)
        document.removeEventListener('focusin', handleClickOutside)
      }
    }
    return undefined
  })
</script>

<div {...dataAttributes} bind:this={containerRef} class={cn('dropdown', align === 'end' ? 'dropdown-end' : '', open ? 'dropdown-open' : '', className)}>
  <button
    type='button'
    class='btn btn-ghost {compact ? 'btn-sm btn-square' : 'gap-2'}'
    onclick={() => (open = !open)}
    onkeydown={handleKeydown}
    aria-label={displaySelectLabel}
    aria-expanded={open}
    aria-controls={menuId}
  >
    <!-- 当前主题预览 -->
    {#if showPreview}
      <div
        class='w-5 h-5 rounded-full border-2 shrink-0'
        style={renderThemePreview(currentInfo)}
      ></div>
    {/if}
    {#if !compact}
      <span class='text-sm'>{themeName(currentInfo)}</span>
      <!-- 下拉箭头 -->
      <svg xmlns='http://www.w3.org/2000/svg' class='h-4 w-4' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'>
        <path stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7' />
      </svg>
    {/if}
  </button>

  {#if open}
    <!-- 主题列表 -->
    <div id={menuId} class='dropdown-content bg-base-100 rounded-box shadow-xl border border-base-content/10 z-50 p-4 max-h-[80vh] overflow-y-auto {compact ? 'w-56 right-0' : ''}'>
      {#if grouped}
        <!-- 分组显示 -->
        {#each THEME_GROUPS as group (group.nameKey)}
          <div class='mb-4 last:mb-0'>
            <div class='text-xs font-semibold text-base-content/50 uppercase tracking-wider px-2 mb-2'>
              {uiM(group.nameKey)}
            </div>
            <div class='flex flex-wrap gap-2'>
              {#each group.themes as theme (theme.id)}
                <button
                  type='button'
                  class={cn(
                    'flex min-w-28 max-w-full items-center gap-2 px-3 py-1.5 rounded-lg text-left transition-colors',
                    theme.id === currentTheme
                      ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                      : 'hover:bg-base-200',
                  )}
                  onclick={() => selectTheme(theme.id)}
                  onkeydown={handleKeydown}
                  data-theme-option={theme.id}
                  aria-pressed={theme.id === currentTheme}
                >
                  <!-- 主题预览色块 -->
                  <div
                    class='w-4 h-4 rounded border shrink-0'
                    style={renderThemePreview(theme)}
                  ></div>
                  <!-- 主题名称 -->
                  <span class='text-sm'>{themeName(theme)}</span>
                  <!-- 选中标记 -->
                  {#if theme.id === currentTheme}
                    <svg xmlns='http://www.w3.org/2000/svg' class='h-4 w-4 text-primary shrink-0' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'>
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
        <div class='flex flex-wrap gap-2'>
          {#each THEMES as theme (theme.id)}
            <button
              type='button'
              class={cn(
                'flex min-w-28 max-w-full items-center gap-2 px-3 py-1.5 rounded-lg text-left transition-colors',
                theme.id === currentTheme
                  ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                  : 'hover:bg-base-200',
              )}
              onclick={() => selectTheme(theme.id)}
              onkeydown={handleKeydown}
              data-theme-option={theme.id}
              aria-pressed={theme.id === currentTheme}
            >
              <div
                class='w-4 h-4 rounded border shrink-0'
                style={renderThemePreview(theme)}
              ></div>
              <span class='text-sm'>{themeName(theme)}</span>
              {#if theme.id === currentTheme}
                <svg xmlns='http://www.w3.org/2000/svg' class='h-4 w-4 text-primary shrink-0' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'>
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
