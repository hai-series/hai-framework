<!--
  @component Tag
  =============================================================================
  @h-ai/ui - Tag 组件
  =============================================================================
  标签组件

  使用 Svelte 5 Runes ($props, $derived)
  =============================================================================

  @example
  ```ts
  import { mount, unmount } from 'svelte'
  import type { ComponentProps } from 'svelte'
  import { Tag } from '@h-ai/ui'
  const props: ComponentProps<typeof Tag> = { text: '已启用', variant: 'success', closable: true }
  const component = mount(Tag, { target: document.body, props })
  await unmount(component)
  ```
-->
<script lang='ts'>
  import type { DataAttributes, TagProps } from '../../types.js'
  import { cn, getDataAttributes, getSizeClass, getVariantClass } from '../../utils.js'

  const {
    text = '',
    variant = 'default',
    size = 'md',
    closable = false,
    outline = false,
    /** 移除按钮的 aria-label */
    removeLabel = 'Remove tag',
    class: className = '',
    onclose,
    children,
    ...restProps
  }: TagProps & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
  const tagClass = $derived(
    cn(
      'badge gap-1',
      getVariantClass(variant, 'badge'),
      getSizeClass(size, 'badge'),
      outline && 'badge-outline',
      className,
    ),
  )

  function handleClose(e: MouseEvent) {
    e.stopPropagation()
    onclose?.()
  }
</script>

<span {...dataAttributes} class={tagClass}>
  {#if children}
    {@render children()}
  {:else}
    {text}
  {/if}

  {#if closable}
    <button
      type='button'
      class='-mr-1 flex size-4 shrink-0 items-center justify-center rounded-full text-current/70 transition-colors hover:bg-current/15 hover:text-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current/40'
      aria-label={removeLabel}
      onclick={handleClose}
    >
      <span class='icon-[tabler--x] size-3' aria-hidden='true'></span>
    </button>
  {/if}
</span>
