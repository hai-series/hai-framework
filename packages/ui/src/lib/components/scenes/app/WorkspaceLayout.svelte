<!--
  @component WorkspaceLayout
  紧凑工作区内容框架；导航标题、主内容和可选页脚共享剩余高度。
  @example
  ```ts
  import type { ComponentProps } from 'svelte'
  import { WorkspaceLayout } from '@h-ai/ui/components/scenes/app/index'
  const props: Pick<ComponentProps<typeof WorkspaceLayout>, 'title'> = { title: '用户管理' }
  ```
-->
<script lang='ts'>
  import type { Snippet } from 'svelte'
  import type { DataAttributes } from '../../../types.js'
  import type { WorkspaceContext } from '../../../workspace-context.js'
  import { setContext } from 'svelte'
  import { cn, getDataAttributes } from '../../../utils.js'
  import { workspaceContextKey } from '../../../workspace-context.js'

  /** WorkspaceLayout 组件的属性契约。
   * @example
   * ```ts
   * import type { ComponentProps } from 'svelte'
   * import { WorkspaceLayout } from '@h-ai/ui'
   * const props: Pick<ComponentProps<typeof WorkspaceLayout>, 'title'> = { title: '工作区' }
   * void props
   * ```
   */
  interface Props extends DataAttributes {
    /** 已在导航显示的页面标题；省略时仅提供内容布局。 */
    title?: string
    /** 导航标题前的菜单按钮或面包屑。 */
    leading?: Snippet
    /** 导航右侧操作。 */
    actions?: Snippet
    /** 页脚内容；未提供时不预留页脚高度。 */
    footer?: Snippet
    children: Snippet
    class?: string
  }
  const { title = '', leading, actions, footer, children, class: className = '', ...restProps }: Props = $props()
  const headingId = $props.id()
  const dataAttributes = $derived(getDataAttributes(restProps))
  setContext<WorkspaceContext>(workspaceContextKey, {
    get title() {
      return title
    },
  })
</script>

<div class={cn('hai-workspace flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden', className)}>
  {#if title || leading || actions}
    <header class='flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-base-content/8 bg-base-100 px-3 sm:px-4'>
      <div class='flex min-w-0 flex-1 basis-40 items-center gap-2'>
        {#if leading}{@render leading()}{/if}
        {#if title}<h1 id={headingId} class='min-w-0 truncate text-sm font-semibold'>{title}</h1>{/if}
      </div>
      {#if actions}<div class='ml-auto flex max-w-full shrink-0 flex-wrap items-center gap-1.5 sm:gap-2'>{@render actions()}</div>{/if}
    </header>
  {/if}
  <main {...dataAttributes} aria-labelledby={title ? headingId : undefined} class='flex min-h-0 min-w-0 flex-1 flex-col overflow-auto p-3 sm:p-4'>
    {@render children()}
  </main>
  {#if footer}<footer class='shrink-0 border-t border-base-content/8 px-3 py-1 text-center text-xs text-base-content/45 sm:px-4'>{@render footer()}</footer>{/if}
</div>
