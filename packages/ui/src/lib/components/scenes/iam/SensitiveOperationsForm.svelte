<!--
  @component 编辑权限关联的敏感操作 ID；只处理表单，持久化和授权由宿主负责。
  @example
  ```ts
  import { mount, unmount } from 'svelte'
  import { ok } from '@h-ai/core'
  import { SensitiveOperationsForm } from '@h-ai/ui'
  const component = mount(SensitiveOperationsForm, { target: document.body, props: { operations: ['orders.approve'], onsubmit: async () => ok(undefined) } })
  await unmount(component)
  ```
-->
<script lang='ts'>
  import type { HaiResult } from '@h-ai/core'
  import { onDestroy, untrack } from 'svelte'
  import { uiM } from '../../../messages.js'
  import Button from '../../primitives/Button.svelte'
  import Textarea from '../../primitives/Textarea.svelte'

  const { operations, onsubmit, ondone }: {
    operations: readonly string[]
    onsubmit: (operations: string[]) => Promise<HaiResult<unknown>>
    ondone?: () => void
  } = $props()
  let value = $state(untrack(() => operations.join('\n')))
  let loading = $state(false)
  let error = $state('')
  let disposed = false
  onDestroy(() => {
    disposed = true
  })

  async function save(event: SubmitEvent): Promise<void> {
    event.preventDefault()
    if (loading)
      return
    const items = [...new Set(value.split(/\r?\n/).map(item => item.trim()).filter(Boolean))]
    if (items.length > 1000 || items.some(item => item.length > 128)) {
      error = uiM('sensitive_operations_invalid')
      return
    }
    loading = true
    error = ''
    try {
      const result = await onsubmit(items)
      if (!result.success)
        error = result.error.message
      else if (!disposed)
        ondone?.()
    }
    catch {
      error = uiM('auth_network_error')
    }
    finally {
      loading = false
    }
  }
</script>

<form class='space-y-4' onsubmit={save} data-testid='sensitive-operations-form'>
  <label class='block space-y-2 text-sm font-medium'>
    <span>{uiM('sensitive_operations_label')}</span>
    <Textarea bind:value rows={6} disabled={loading} aria-label={uiM('sensitive_operations_label')} />
  </label>
  <p class='text-sm text-base-content/60'>{uiM('sensitive_operations_hint')}</p>
  {#if error}<p role='alert' class='text-sm text-error'>{error}</p>{/if}
  <div class='flex justify-end'><Button type='submit' variant='primary' {loading}>{uiM('crud_save')}</Button></div>
</form>
