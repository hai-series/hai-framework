<!--
  @component ReauthenticationDialog
  敏感操作前重新输入密码；鉴别、操作绑定和凭据使用由宿主服务负责。
  @example
  ```ts
  import { mount, unmount } from 'svelte'
  import { ReauthenticationDialog } from '@h-ai/ui'
  const component = mount(ReauthenticationDialog, { target: document.body, props: { open: true, onsubmit: async (password: string) => { void password }, onclose: () => {} } })
  await unmount(component)
  ```
-->
<script lang='ts'>
  import type { DataAttributes } from '../../../types.js'
  import type { ReauthenticationDialogProps } from '../types.js'
  import { uiM } from '../../../messages.js'
  import { useToastFeedback } from '../../../toast.svelte.js'
  import { getDataAttributes } from '../../../utils.js'
  import FormField from '../../compounds/FormField.svelte'
  import Modal from '../../compounds/Modal.svelte'
  import Button from '../../primitives/Button.svelte'
  import PasswordInput from './PasswordInput.svelte'

  const { open, loading = false, error = '', onsubmit, onclose, ...restProps }: ReauthenticationDialogProps & DataAttributes = $props()
  const dataAttributes = $derived(getDataAttributes(restProps))
  const fieldId = $props.id()
  let password = $state('')
  $effect(() => {
    if (!open)
      password = ''
  })
  async function submit(event: SubmitEvent) {
    event.preventDefault()
    try {
      await onsubmit(password)
    }
    finally {
      password = ''
    }
  }
  function close() {
    password = ''
    onclose()
  }
  useToastFeedback(() => open ? error : '')
</script>

<div {...dataAttributes} class='reauthentication-layer'>
  <Modal {open} title={uiM('reauthentication_title')} onclose={close} closeOnBackdrop={!loading} closeOnEscape={!loading} showClose={!loading} size='sm'>
    <form class='space-y-4' onsubmit={submit} data-testid='reauthentication-form'>
      <p class='text-sm text-base-content/60'>{uiM('reauthentication_hint')}</p>
      <FormField label={uiM('reauthentication_password')} for={fieldId}>
        <PasswordInput id={fieldId} bind:value={password} autocomplete='current-password' disabled={loading} required data-testid='reauthentication-password' />
      </FormField>
      <div class='flex justify-end gap-2'>
        <Button variant='ghost' disabled={loading} onclick={close}>{uiM('confirm_cancel')}</Button>
        <Button type='submit' variant='primary' {loading} disabled={!password}>{uiM('reauthentication_confirm')}</Button>
      </div>
    </form>
  </Modal>
</div>

<style>
  /* 再鉴别可由已打开的业务弹窗触发，必须显示在同层业务弹窗上方。 */
  .reauthentication-layer {
    position: relative;
    z-index: calc(var(--hai-z-modal, 1100) + 1);
  }
</style>
