<!--
  @component ErrorPage
  通用错误页场景组件

  展示大号状态码 + 标题 + 描述 + 操作按钮，内置 401/403/404/500/503 预设。
  借鉴 shadcn-admin 错误页布局，复用现有主题 token。

  使用 Svelte 5 Runes ($props, $derived)

  @example
  <ErrorPage status={403} homeUrl="/admin" onback={() => history.back()} />
-->
<script lang='ts'>
  import type { Snippet } from 'svelte'
  import type { ErrorPreset } from './error-presets.js'
  import { uiM } from '../../../messages.js'
  import { cn } from '../../../utils.js'
  import Button from '../../primitives/Button.svelte'
  import { ERROR_PRESETS, resolveErrorPreset } from './error-presets.js'

  const {
    status = 404,
    code,
    title,
    description,
    showHome = true,
    showBack = true,
    homeUrl = '/',
    onhome,
    onback,
    icon,
    actions,
    class: className = '',
  }: {
    /** HTTP 状态码或预设标识；未命中预设时回退到最接近的预设 */
    status?: number | string | ErrorPreset
    /** 自定义大号展示码（覆盖预设） */
    code?: string
    /** 自定义标题（覆盖预设文案） */
    title?: string
    /** 自定义描述（覆盖预设文案） */
    description?: string
    /** 是否显示「返回首页」按钮 */
    showHome?: boolean
    /** 是否显示「返回上一页」按钮 */
    showBack?: boolean
    /** 首页地址（未提供 onhome 时作为链接跳转） */
    homeUrl?: string
    /** 自定义「返回首页」处理（优先于 homeUrl 链接） */
    onhome?: () => void
    /** 自定义「返回上一页」处理（默认 history.back()） */
    onback?: () => void
    /** 自定义图标插槽 */
    icon?: Snippet
    /** 自定义操作区插槽（提供时覆盖默认按钮） */
    actions?: Snippet
    class?: string
  } = $props()

  const preset = $derived(ERROR_PRESETS[resolveErrorPreset(status)])
  const displayCode = $derived(code ?? preset.code)
  const displayTitle = $derived(title ?? uiM(preset.titleKey))
  const displayDesc = $derived(description ?? uiM(preset.descKey))

  function handleBack() {
    if (onback) {
      onback()
      return
    }
    if (typeof history !== 'undefined') {
      history.back()
    }
  }

  function handleHome() {
    onhome?.()
  }
</script>

<div class={cn('flex min-h-[60vh] w-full flex-col items-center justify-center px-6 py-12 text-center', className)}>
  <!-- 图标 -->
  <div class='mb-6 flex size-16 items-center justify-center rounded-2xl bg-base-content/5 text-base-content/40'>
    {#if icon}
      {@render icon()}
    {:else}
      <span class='{preset.icon} size-8'></span>
    {/if}
  </div>

  <!-- 大号状态码 -->
  <p class='text-6xl font-bold tracking-tight text-base-content/85 sm:text-7xl'>{displayCode}</p>

  <!-- 标题 -->
  <h1 class='mt-4 text-xl font-semibold text-base-content sm:text-2xl'>{displayTitle}</h1>

  <!-- 描述 -->
  <p class='mt-2 max-w-md text-sm text-base-content/55'>{displayDesc}</p>

  <!-- 操作区 -->
  <div class='mt-8 flex flex-wrap items-center justify-center gap-3'>
    {#if actions}
      {@render actions()}
    {:else}
      {#if showBack}
        <Button variant='outline' size='sm' onclick={handleBack}>
          <span class='icon-[tabler--arrow-left] mr-1.5 size-4'></span>
          {uiM('error_go_back')}
        </Button>
      {/if}
      {#if showHome}
        {#if onhome}
          <Button variant='primary' size='sm' onclick={handleHome}>
            <span class='icon-[tabler--home] mr-1.5 size-4'></span>
            {uiM('error_back_home')}
          </Button>
        {:else}
          <a href={homeUrl} class='btn btn-primary btn-sm'>
            <span class='icon-[tabler--home] mr-1.5 size-4'></span>
            {uiM('error_back_home')}
          </a>
        {/if}
      {/if}
    {/if}
  </div>
</div>
