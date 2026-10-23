<!--
  @component PageHeader
  页面头部组件，包含标题、描述和操作按钮区域。

  @prop {string} title - 页面标题
  @prop {string} description - 页面描述
  @prop {Snippet} actions - 右侧操作按钮插槽

  @example
  ```ts
  import { mount, unmount } from 'svelte'
  import type { ComponentProps } from 'svelte'
  import { PageHeader } from '@h-ai/ui'
  const props: ComponentProps<typeof PageHeader> = { title: '用户管理', description: '维护用户资料' }
  const component = mount(PageHeader, { target: document.body, props })
  await unmount(component)
  ```
-->
<script lang='ts'>
  import type { Snippet } from 'svelte'
  import type { DataAttributes } from '../../types.js'
  import { getDataAttributes } from '../../utils.js'

  /**
   * PageHeader 组件的属性契约；通过公开组件配置使用。
   *
   * @example
   * ```ts
   * import { mount, unmount } from 'svelte'
   * import type { ComponentProps } from 'svelte'
   * import { PageHeader } from '@h-ai/ui'
   * const props: ComponentProps<typeof PageHeader> = { title: '用户管理', description: '维护用户资料' }
   * const component = mount(PageHeader, { target: document.body, props })
   * await unmount(component)
   * ```
   */
  interface Props {
    title: string
    description?: string
    actions?: Snippet
    class?: string
  }

  const { title, description, actions, class: className = '', ...restProps }: Props & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
</script>

<div {...dataAttributes} class='flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 {className}'>
  <div>
    <h1 class='text-xl font-semibold tracking-tight'>{title}</h1>
    {#if description}
      <p class='text-sm text-base-content/45 mt-0.5'>{description}</p>
    {/if}
  </div>
  {#if actions}
    <div class='flex items-center gap-2'>
      {@render actions()}
    </div>
  {/if}
</div>
