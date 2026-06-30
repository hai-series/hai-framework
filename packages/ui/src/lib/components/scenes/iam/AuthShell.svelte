<!--
  @component AuthShell
  认证页布局场景组件

  借鉴 shadcn-admin sign-in / sign-in-2：支持居中卡片（card）与左右分栏（split）两种布局。
  品牌区、标题、副标题、表单内容由使用方提供。

  使用 Svelte 5 Runes ($props, $derived)

  @example
  <AuthShell variant="card" title="登录" subtitle="欢迎回来">
    <LoginForm onsubmit={handleLogin} />
  </AuthShell>
-->
<script lang='ts'>
  import type { Snippet } from 'svelte'
  import type { DataAttributes } from '../../../types.js'
  import { cn, getDataAttributes } from '../../../utils.js'

  const {
    variant = 'card',
    title = '',
    subtitle = '',
    brandTitle = '',
    brandText = '',
    logo,
    illustration,
    description,
    highlights,
    brand,
    footer,
    children,
    class: className = '',
    ...restProps
  }: {
    /** 布局形态：'card'（居中卡片，默认）或 'split'（左右分栏） */
    variant?: 'card' | 'split'
    /** 表单区标题 */
    title?: string
    /** 表单区副标题 */
    subtitle?: string
    /** split 模式品牌区主标题 */
    brandTitle?: string
    /** split 模式品牌区描述文案 */
    brandText?: string
    /** 顶部 Logo 插槽 */
    logo?: Snippet
    /** split 模式品牌区插图（如大图/海报） */
    illustration?: Snippet
    /** split 模式品牌区描述区（覆盖 brandText） */
    description?: Snippet
    /** split 模式品牌区重点信息（如卖点列表） */
    highlights?: Snippet
    /** split 模式品牌区自定义插槽（覆盖 brandTitle/brandText） */
    brand?: Snippet
    /** 底部插槽（如注册/登录切换链接） */
    footer?: Snippet
    /** 表单内容 */
    children?: Snippet
    class?: string
  } & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
  const isSplit = $derived(variant === 'split')
  // split 模式下品牌区已展示 Logo，表单区仅在小屏展示，避免桌面端重复
  const logoWrapClass = $derived(isSplit ? 'mb-6 flex justify-center lg:hidden' : 'mb-6 flex justify-center')
</script>

{#snippet formPanel()}
  <div {...dataAttributes} class='flex w-full max-w-sm flex-col'>
    {#if logo}
      <div class={logoWrapClass}>{@render logo()}</div>
    {/if}
    {#if title}
      <h1 class='text-center text-2xl font-semibold tracking-tight text-base-content'>{title}</h1>
    {/if}
    {#if subtitle}
      <p class='mt-2 text-center text-sm text-base-content/55'>{subtitle}</p>
    {/if}
    <div class='mt-7'>
      {#if children}{@render children()}{/if}
    </div>
    {#if footer}
      <div class='mt-6 text-center text-sm text-base-content/60'>{@render footer()}</div>
    {/if}
  </div>
{/snippet}

{#if isSplit}
  <div class={cn('grid min-h-screen lg:grid-cols-2', className)}>
    <!-- 品牌区 -->
    <div class='relative hidden overflow-hidden bg-primary p-10 text-primary-content lg:flex'>
      <div class='pointer-events-none absolute inset-0 opacity-20' style='background-image: radial-gradient(circle at 20% 20%, currentColor 1px, transparent 1px); background-size: 28px 28px;'></div>
      {#if brand}
        {@render brand()}
      {:else}
        <div class='relative z-10 flex w-full flex-1 flex-col justify-between gap-10'>
          <div class='space-y-6'>
            {#if logo}
              <div>{@render logo()}</div>
            {/if}
            {#if illustration}
              <div class='overflow-hidden rounded-2xl border border-primary-content/15 bg-primary-content/5 p-2'>
                {@render illustration()}
              </div>
            {/if}
          </div>

          <div class='space-y-4'>
            {#if brandTitle}
              <h2 class='text-3xl font-semibold leading-snug'>{brandTitle}</h2>
            {/if}
            {#if description}
              <div class='max-w-xl text-sm text-primary-content/85'>
                {@render description()}
              </div>
            {:else if brandText}
              <p class='max-w-xl text-sm text-primary-content/80'>{brandText}</p>
            {/if}
          </div>

          {#if highlights}
            <div class='max-w-xl text-sm text-primary-content/90'>
              {@render highlights()}
            </div>
          {/if}
        </div>
      {/if}
    </div>
    <!-- 表单区 -->
    <div class='flex items-center justify-center p-6 sm:p-10'>
      {@render formPanel()}
    </div>
  </div>
{:else}
  <div class={cn('flex min-h-screen items-center justify-center bg-base-200/40 p-6', className)}>
    <div class='w-full max-w-md rounded-2xl border border-base-content/8 bg-base-100 p-8 shadow-sm sm:p-10'>
      {@render formPanel()}
    </div>
  </div>
{/if}
