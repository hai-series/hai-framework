<!--
  @component CrudDeleteConfirm
  CRUD 删除确认对话框

  使用 Svelte 5 Runes ($props)
  使用 compounds 组件：Confirm
-->
<script lang='ts'>
  import { uiM } from '../../../messages.js'
  import Confirm from '../../compounds/Confirm.svelte'

  let {
    open = $bindable(false),
    loading = false,
    title = '',
    message = '',
    onconfirm,
    oncancel,
  }: {
    open?: boolean
    loading?: boolean
    title?: string
    message?: string
    onconfirm?: () => Promise<void> | void
    oncancel?: () => void
  } = $props()
</script>

<Confirm
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
