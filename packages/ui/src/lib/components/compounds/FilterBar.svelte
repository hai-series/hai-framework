<!--
  @component FilterBar
  常用搜索与操作保持可见，更多筛选可展开收起；收起不卸载控件或清除值。
  @example
  ```ts
  import type { ComponentProps } from 'svelte'
  import { FilterBar } from '@h-ai/ui/components/compounds/index'
  const props: Pick<ComponentProps<typeof FilterBar>, 'expanded' | 'activeCount'> = { expanded: false, activeCount: 2 }
  ```
-->
<script lang='ts'>
  import type { Snippet } from 'svelte'
  import type { DataAttributes } from '../../types.js'
  import { uiM } from '../../messages.js'
  import { cn, getDataAttributes } from '../../utils.js'
  import Button from '../primitives/Button.svelte'

  /** FilterBar 组件的属性契约。
   * @example
   * ```ts
   * import type { ComponentProps } from 'svelte'
   * import { FilterBar } from '@h-ai/ui'
   * const props: Partial<ComponentProps<typeof FilterBar>> = {}
   * void props
   * ```
   */
  interface Props extends DataAttributes {
    /** 常驻搜索或主要条件。 */
    leading?: Snippet
    /** 查询、重置和业务操作。 */
    actions?: Snippet
    /** 可收起的筛选字段。 */
    children?: Snippet
    /** 是否展开；默认收起，可 bind:expanded。 */
    expanded?: boolean
    /** 已启用条件数量，收起时仍提示。 */
    activeCount?: number
    /** 清空查询与全部筛选；按钮文案由 UI 提供。 */
    onreset?: () => void
    class?: string
  }
  let { leading, actions, children, expanded = $bindable(false), activeCount = 0, onreset, class: className = '', ...restProps }: Props = $props()
  const dataAttributes = $derived(getDataAttributes(restProps))
  const panelId = $props.id()
  const toggleLabel = $derived(uiM(expanded ? 'filter_bar_collapse' : 'filter_bar_expand'))
</script>

<div {...dataAttributes} class={cn('hai-filter-bar min-w-0 space-y-3 [&_.fieldset]:m-0 [&_.fieldset]:p-0 [&_.fieldset]:min-w-0', className)}>
  <div class='flex min-w-0 flex-wrap items-center gap-2'>
    {#if leading}<div class='flex min-w-0 max-w-full flex-[1_1_14rem] flex-wrap items-center gap-2'>{@render leading()}</div>{/if}
    <div class='ml-auto flex max-w-full shrink-0 flex-wrap items-center gap-2'>
      {#if actions}{@render actions()}{/if}
      {#if onreset}<Button type='button' variant='ghost' size='sm' onclick={onreset}>{uiM('crud_reset')}</Button>{/if}
      {#if children}
        <button type='button' class='hai-filter-bar__toggle inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-sm text-base-content/65 hover:bg-base-content/5 hover:text-base-content' aria-expanded={expanded} aria-controls={panelId} onclick={() => { expanded = !expanded }}>
          <span>{toggleLabel}</span>
          {#if activeCount > 0}<span class='rounded bg-primary/10 px-1.5 text-xs text-primary' aria-label={uiM('filter_bar_active').replace('{count}', String(activeCount))}>{activeCount}</span>{/if}
          <span class='icon-[tabler--chevron-down] size-4 transition-transform' class:rotate-180={expanded} aria-hidden='true'></span>
        </button>
      {/if}
    </div>
  </div>
  {#if children}
    <div id={panelId} hidden={!expanded} class={expanded ? 'hai-filter-bar__panel flex min-w-0 flex-wrap items-start gap-4 border-t border-base-content/8 pt-3 pb-1' : 'hidden'}>
      {@render children()}
    </div>
  {/if}
</div>

<style>
  .hai-filter-bar__panel {
    max-height: min(26rem, 50dvh);
    overflow-y: auto;
  }

  @media (pointer: coarse) {
    .hai-filter-bar__toggle {
      min-height: var(--hai-touch-target-min, 44px);
      min-width: var(--hai-touch-target-min, 44px);
    }
  }
</style>
