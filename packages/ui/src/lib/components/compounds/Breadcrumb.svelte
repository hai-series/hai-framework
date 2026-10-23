<!--
  @component Breadcrumb
  =============================================================================
  @h-ai/ui - Breadcrumb 组件
  =============================================================================
  面包屑导航组件

  使用 Svelte 5 Runes ($props)
  =============================================================================

  @example
  ```ts
  import { mount, unmount } from 'svelte'
  import type { ComponentProps } from 'svelte'
  import { Breadcrumb } from '@h-ai/ui'
  const props: ComponentProps<typeof Breadcrumb> = { items: [{ label: '首页', href: '/' }, { label: '设置' }] }
  const component = mount(Breadcrumb, { target: document.body, props })
  await unmount(component)
  ```
-->
<script lang='ts'>
  import type { BreadcrumbProps, DataAttributes } from '../../types.js'
  import { cn, getDataAttributes } from '../../utils.js'

  const {
    items,
    class: className = '',
    ...restProps
  }: BreadcrumbProps & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
  const breadcrumbClass = $derived(
    cn(
      'breadcrumbs text-sm',
      className,
    ),
  )
</script>

<div {...dataAttributes} class={breadcrumbClass}>
  <ul>
    {#each items as item, index (item.href ?? `${item.label}:${index}`)}
      <li>
        {#if item.href && index < items.length - 1}
          <a href={item.href}>
            {#if item.icon}
              <span class='mr-1'>{item.icon}</span>
            {/if}
            {item.label}
          </a>
        {:else}
          <span>
            {#if item.icon}
              <span class='mr-1'>{item.icon}</span>
            {/if}
            {item.label}
          </span>
        {/if}
      </li>
    {/each}
  </ul>
</div>
