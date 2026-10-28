<script lang='ts'>
  import * as m from '$lib/paraglide/messages.js'
  import { inviteUser } from '$lib/services/invitation.js'
  import { Button, FormField, FormLayout, Input, Modal, Select } from '@h-ai/ui'
  import { errorMessage as formatOperationError, useToastFeedback } from '@h-ai/ui/toast'

  interface Props {
    open: boolean
    mode: 'email' | 'phone'
    roles: { id: string, name: string }[]
    onclose: () => void
    onrefresh: () => Promise<void>
  }
  const { open, mode, roles, onclose, onrefresh }: Props = $props()
  let username = $state('')
  let email = $state('')
  let phone = $state('')
  let role = $state('')
  let loading = $state(false)
  let error = $state('')
  const roleOptions = $derived([{ value: '', label: m.invitation_default_role() }, ...roles.map(role => ({ value: role.id, label: role.name }))])
  async function submit(event: SubmitEvent) {
    event.preventDefault()
    loading = true
    error = ''
    try {
      const result = await inviteUser({ username, email: email || undefined, phone: mode === 'phone' ? phone : undefined, roles: role ? [role] : undefined })
      await onrefresh()
      if (!result.success) {
        error = `${formatOperationError(result.error, m.common_error())} ${m.invitation_check_existing()}`
        return
      }
      username = ''
      email = ''
      phone = ''
      role = ''
      onclose()
    }
    catch { error = `${m.common_network_error()} ${m.invitation_check_existing()}` }
    finally { loading = false }
  }
  useToastFeedback(() => error)
</script>

<Modal {open} title={m.invitation_title()} onclose={onclose} closeOnBackdrop={!loading} closeOnEscape={!loading} showClose={!loading}>
  <form class='space-y-4' onsubmit={submit} data-testid='invite-user-form'>
    <p class='text-sm text-base-content/60'>{m.invitation_hint()}</p>
    <FormLayout columns={2}>
      <FormField label={m.iam_users_col_username()} required><Input bind:value={username} required minlength={3} maxlength={20} pattern='[A-Za-z0-9_]+' data-testid='invite-username' /></FormField>
      <FormField label={m.iam_users_col_email()} required={mode === 'email'}><Input type='email' bind:value={email} required={mode === 'email'} data-testid='invite-email' /></FormField>
      {#if mode === 'phone'}<FormField label={m.invitation_phone()} required><Input type='tel' bind:value={phone} required maxlength={32} data-testid='invite-phone' /></FormField>{/if}
      <FormField label={m.iam_users_col_roles()}><Select bind:value={role} options={roleOptions} data-testid='invite-role' /></FormField>
    </FormLayout>
    <div class='flex justify-end gap-2'><Button variant='ghost' disabled={loading} onclick={onclose}>{m.action_cancel()}</Button><Button type='submit' {loading}>{m.invitation_send()}</Button></div>
  </form>
</Modal>
