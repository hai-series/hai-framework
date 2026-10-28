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
  import type { DataAttributes } from '../../../types.js'
  import { onDestroy, untrack } from 'svelte'
  import { uiM } from '../../../messages.js'
  import { errorMessage, toast, useToastFeedback } from '../../../toast.svelte.js'
  import { getDataAttributes } from '../../../utils.js'
  import Button from '../../primitives/Button.svelte'
  import Textarea from '../../primitives/Textarea.svelte'

  const { operations, onsubmit, ondone, ...restProps }: {
    operations: readonly string[]
    onsubmit: (operations: string[]) => Promise<HaiResult<unknown>>
    ondone?: () => void
  } & DataAttributes = $props()
  const dataAttributes = $derived(getDataAttributes(restProps))
  let value = $state(untrack(() => operations.join('\n')))
  let loading = $state(false)
  let error = $state('')
  let fieldError = $state('')
  let disposed = false
  onDestroy(() => {
    disposed = true
  })

  async function save(event: SubmitEvent): Promise<void> {
    event.preventDefault()
    if (loading)
      return
    const items = [...new Set(value.split(/\r?\n/).map(item => item.trim()).filter(Boolean))]
    fieldError = ''
    if (items.length > 1000 || items.some(item => item.length > 128)) {
      fieldError = uiM('sensitive_operations_invalid')
      return
    }
    loading = true
    error = ''
    try {
      const result = await onsubmit(items)
      if (!result.success) {
        error = errorMessage(result.error, uiM('crud_submit_failed'))
      }
      else if (!disposed) {
        toast.success(uiM('crud_submit_success'))
        ondone?.()
      }
    }
    catch {
      error = uiM('auth_network_error')
    }
    finally {
      loading = false
    }
  }
  useToastFeedback(() => error)
</script>

<form data-testid='sensitive-operations-form' {...dataAttributes} class='space-y-4' onsubmit={save}>
  <label class='block space-y-2 text-sm font-medium'>
    <span>{uiM('sensitive_operations_label')}</span>
    <Textarea bind:value rows={6} disabled={loading} error={fieldError} />
  </label>
  <p class='text-sm text-base-content/60'>{uiM('sensitive_operations_hint')}</p>
  <div class='flex justify-end'><Button type='submit' variant='primary' {loading}>{uiM('crud_save')}</Button></div>
</form>
