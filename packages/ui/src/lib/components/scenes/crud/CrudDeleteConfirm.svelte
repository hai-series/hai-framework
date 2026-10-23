<!--
  @component CrudDeleteConfirm
  CRUD 删除确认对话框

  使用 Svelte 5 Runes ($props)
  使用 compounds 组件：Confirm

  @example
  ```ts
  import { mount, unmount } from 'svelte'
  import type { ComponentProps } from 'svelte'
  import { CrudDeleteConfirm } from '@h-ai/ui'
  const props: ComponentProps<typeof CrudDeleteConfirm> = { open: true, title: '删除用户', message: '删除后不可恢复。' }
  const component = mount(CrudDeleteConfirm, { target: document.body, props })
  await unmount(component)
  ```
-->
<script lang='ts'>
  import type { DataAttributes } from '../../../types.js'
  import { uiM } from '../../../messages.js'
  import { getDataAttributes } from '../../../utils.js'
  import Confirm from '../../compounds/Confirm.svelte'

  let {
    open = $bindable(false),
    loading = false,
    title = '',
    message = '',
    onconfirm,
    oncancel,
    class: className = '',
    ...restProps
  }: {
    open?: boolean
    loading?: boolean
    title?: string
    message?: string
    onconfirm?: () => Promise<void> | void
    oncancel?: () => void
    class?: string
  } & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
</script>

<Confirm {...dataAttributes}
         class={className}
         bind:open
         title={title || uiM('crud_delete_title')}
         message={message || uiM('crud_delete_message')}
         confirmText={uiM('crud_delete')}
         cancelText={uiM('crud_cancel')}
         variant='error'
         {loading}
         {onconfirm}
         {oncancel}
/>
