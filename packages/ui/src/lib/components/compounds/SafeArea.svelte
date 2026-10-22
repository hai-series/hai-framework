<!--
  @component SafeArea
  @h-ai/ui — SafeArea（安全区域包裹组件）

  用法：
  <SafeArea position="top">
    <AppBar />
  </SafeArea>

  @example
  ```ts
  import { mount, unmount, createRawSnippet } from 'svelte'
  import type { ComponentProps } from 'svelte'
  import { SafeArea } from '@h-ai/ui'
  const props: ComponentProps<typeof SafeArea> = { position: 'all', children: createRawSnippet(() => ({ render: () => "<main>页面内容</main>" })) }
  const component = mount(SafeArea, { target: document.body, props })
  await unmount(component)
  ```
-->
<script lang='ts'>
  import type { Snippet } from 'svelte'
  import type { DataAttributes } from '../../types.js'
  import { cn, getDataAttributes } from '../../utils.js'

  /**
   * SafeArea 组件的属性契约；通过公开组件配置使用。
   *
   * @example
   * ```ts
   * import { mount, unmount, createRawSnippet } from 'svelte'
   * import type { ComponentProps } from 'svelte'
   * import { SafeArea } from '@h-ai/ui'
   * const props: ComponentProps<typeof SafeArea> = { position: 'all', children: createRawSnippet(() => ({ render: () => "<main>页面内容</main>" })) }
   * const component = mount(SafeArea, { target: document.body, props })
   * await unmount(component)
   * ```
   */
  interface Props {
    /** 安全区域位置 */
    position?: 'top' | 'bottom' | 'all'
    /** 额外 CSS 类 */
    class?: string
    /** 内容 */
    children: Snippet
  }

  const {
    position = 'all',
    class: className,
    children,
    ...restProps
  }: Props & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
  const positionClasses = $derived({
    top: 'hai-safe-top',
    bottom: 'hai-safe-bottom',
    all: 'hai-safe-all',
  }[position])
</script>

<div {...dataAttributes} class={cn(positionClasses, className)}>
  {@render children()}
</div>
