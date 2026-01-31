<!--
  @component ThemeToggle
  主题切换按钮组件，支持明/暗主题快速切换。

  @prop {string} currentTheme - 当前主题
  @prop {function} onchange - 主题变更回调
  @prop {string} lightTheme - 亮色主题名称
  @prop {string} darkTheme - 暗色主题名称

  @example
  <ThemeToggle 
    currentTheme={$theme}
    onchange={(theme) => themeStore.set(theme)}
  />
-->
<script lang='ts'>
  import { isDarkTheme } from '../../theme-config.js'

  const defaultLabels = {
    switchToLight: 'Switch to light theme',
    switchToDark: 'Switch to dark theme',
  }

  interface Props {
    currentTheme?: string
    onchange?: (theme: string) => void
    lightTheme?: string
    darkTheme?: string
    labels?: {
      switchToLight?: string
      switchToDark?: string
    }
    class?: string
  }

  let {
    currentTheme = 'light',
    onchange,
    lightTheme = 'light',
    darkTheme = 'dark',
    labels = {},
    class: className = '',
  }: Props = $props()

  const mergedLabels = $derived({ ...defaultLabels, ...labels })
  const isDark = $derived(isDarkTheme(currentTheme))

  function toggleTheme() {
    const newTheme = isDark ? lightTheme : darkTheme
    onchange?.(newTheme)
  }
</script>

<div class='tooltip tooltip-bottom {className}' data-tip={isDark ? mergedLabels.switchToLight : mergedLabels.switchToDark}>
  <button
    type='button'
    class='btn btn-ghost btn-sm btn-circle'
    onclick={toggleTheme}
    aria-label={isDark ? mergedLabels.switchToLight : mergedLabels.switchToDark}
  >
    {#if isDark}
      <svg xmlns='http://www.w3.org/2000/svg' class='h-5 w-5' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'>
        <circle cx='12' cy='12' r='5' />
        <line x1='12' y1='1' x2='12' y2='3' />
        <line x1='12' y1='21' x2='12' y2='23' />
        <line x1='4.22' y1='4.22' x2='5.64' y2='5.64' />
        <line x1='18.36' y1='18.36' x2='19.78' y2='19.78' />
        <line x1='1' y1='12' x2='3' y2='12' />
        <line x1='21' y1='12' x2='23' y2='12' />
        <line x1='4.22' y1='19.78' x2='5.64' y2='18.36' />
        <line x1='18.36' y1='5.64' x2='19.78' y2='4.22' />
      </svg>
    {:else}
      <svg xmlns='http://www.w3.org/2000/svg' class='h-5 w-5' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'>
        <path d='M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z' />
      </svg>
    {/if}
  </button>
</div>
