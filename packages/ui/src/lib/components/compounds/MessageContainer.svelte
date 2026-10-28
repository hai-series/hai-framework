<!--
  @component MessageContainer
  消息容器入口，复用统一 Toast。根布局在本组件与 ToastContainer 中选择一个。

  @example
  ```ts
  import { mount, unmount } from 'svelte'
  import type { ComponentProps } from 'svelte'
  import { MessageContainer } from '@h-ai/ui'
  const props: ComponentProps<typeof MessageContainer> = { 'data-testid': 'messages' }
  const component = mount(MessageContainer, { target: document.body, props })
  await unmount(component)
  ```
-->
<script lang='ts'>
  import type { DataAttributes } from '../../types.js'
  import { getDataAttributes } from '../../utils.js'
  import ToastContainer from './ToastContainer.svelte'

  const { ...restProps }: DataAttributes = $props()
  const dataAttributes = $derived(getDataAttributes(restProps))
</script>

<ToastContainer {...dataAttributes} />
