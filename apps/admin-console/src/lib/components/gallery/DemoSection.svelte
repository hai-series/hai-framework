<!--
  =============================================================================
  UI Gallery - 分类区块
  =============================================================================
  组件示例的分类容器：图标 + 标题 + 子标题 + 该分类下的示例卡片列表。
  仅用于 admin-console 的 UI 组件库展示页。
  =============================================================================
-->
<script lang='ts'>
  import type { Snippet } from 'svelte'

  interface Props {
    /** 分类标题 */
    title: string
    /** 分类副标题（通常列出组件名） */
    subtitle?: string
    /** Tabler 图标类名，如 `icon-[tabler--components]` */
    iconClass?: string
    /** 图标主题色，对应 DaisyUI 语义色 */
    tone?: 'primary' | 'secondary' | 'info' | 'success' | 'warning' | 'error'
    /** 该分类下的示例卡片 */
    children: Snippet
  }

  const {
    title,
    subtitle = '',
    iconClass = 'icon-[tabler--components]',
    tone = 'primary',
    children,
  }: Props = $props()

  const toneClass: Record<NonNullable<Props['tone']>, string> = {
    primary: 'bg-primary/10 text-primary',
    secondary: 'bg-secondary/10 text-secondary',
    info: 'bg-info/10 text-info',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
    error: 'bg-error/10 text-error',
  }
</script>

<section class='space-y-4'>
  <div class='flex items-center gap-3'>
    <div class='flex size-10 items-center justify-center rounded-xl {toneClass[tone]}'>
      <span class='{iconClass} size-5'></span>
    </div>
    <div>
      <h2 class='text-xl font-bold'>{title}</h2>
      {#if subtitle}
        <p class='text-sm text-base-content/60'>{subtitle}</p>
      {/if}
    </div>
  </div>

  <div class='space-y-4'>
    {@render children()}
  </div>
</section>
