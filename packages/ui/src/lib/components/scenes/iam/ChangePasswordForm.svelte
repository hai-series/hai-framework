<!--
  @component ChangePasswordForm
  修改密码表单组件。

  @example
  ```ts
  import { mount, unmount } from 'svelte'
  import type { ComponentProps } from 'svelte'
  import { ChangePasswordForm } from '@h-ai/ui'
  const props: ComponentProps<typeof ChangePasswordForm> = { requireOldPassword: true, minPasswordLength: 12 }
  const component = mount(ChangePasswordForm, { target: document.body, props })
  await unmount(component)
  ```
-->
<script lang='ts'>
  import type { DataAttributes } from '../../../types.js'
  import type { ChangePasswordFormData, ChangePasswordFormProps } from '../types.js'
  import { uiM } from '../../../messages.js'
  import { useToastFeedback } from '../../../toast.svelte.js'
  import { cn, getDataAttributes } from '../../../utils.js'
  import FormField from '../../compounds/FormField.svelte'
  import FormLayout from '../../compounds/FormLayout.svelte'
  import Button from '../../primitives/Button.svelte'
  import { arePasswordsEqual, passwordPolicyError, passwordPolicyHint } from './password-utils.js'
  import PasswordInput from './PasswordInput.svelte'

  const {
    loading = false,
    columns = 1,
    labelPosition = 'top',
    labelWidth = '8rem',
    disabled = false,
    requireOldPassword = true,
    showPasswordStrength = true,
    minPasswordLength = 8,
    passwordPolicy,
    submitText,
    class: className = '',
    errors = {},
    onsubmit,
    ...restProps
  }: ChangePasswordFormProps & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
  let oldPassword = $state('')
  let newPassword = $state('')
  let confirmPassword = $state('')

  const policyError = $derived(passwordPolicy && newPassword ? passwordPolicyError(newPassword, passwordPolicy) : '')

  const formClass = $derived(
    cn(
      'change-password-form space-y-5',
      className,
    ),
  )

  const passwordsMatch = $derived(arePasswordsEqual(newPassword, confirmPassword))
  const canSubmit = $derived.by(() => {
    if (requireOldPassword && !oldPassword)
      return false
    if (!newPassword || !confirmPassword)
      return false
    if (!passwordsMatch)
      return false
    return newPassword.length >= minPasswordLength
  })

  /**
   * 提交修改密码数据。
   *
   * @param e 表单提交事件
   * @returns 无返回值
   */
  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (policyError || loading || disabled || !canSubmit)
      return

    const data: ChangePasswordFormData = {
      oldPassword: requireOldPassword ? oldPassword : undefined,
      newPassword,
      confirmPassword,
    }

    await onsubmit?.(data)
  }
  useToastFeedback(() => errors.general)
  useToastFeedback(() => policyError)
</script>

<form {...dataAttributes} class={formClass} onsubmit={handleSubmit}>
  <FormLayout {columns} {labelPosition} {labelWidth}>
    {#if requireOldPassword}
      <FormField for='old-password' label={uiM('change_password_old')}>
        <PasswordInput
          value={oldPassword}
          id='old-password'
          autocomplete='current-password'
          required
          oninput={(e) => { oldPassword = e.currentTarget.value }}
          placeholder={uiM('change_password_old_placeholder')}
          {disabled}
          error={errors.oldPassword}
          showStrength={false}
        />
      </FormField>
    {/if}

    <FormField for='new-password' label={uiM('change_password_new')}>
      <PasswordInput
        value={newPassword}
        id='new-password'
        autocomplete='new-password'
        required
        oninput={(e) => { newPassword = e.currentTarget.value }}
        placeholder={uiM('change_password_new_placeholder')}
        {disabled}
        error={errors.newPassword}
        showStrength={showPasswordStrength}
        minLength={minPasswordLength}
      />
    </FormField>

    <FormField for='confirm-password' label={uiM('change_password_confirm')}>
      <PasswordInput
        value={confirmPassword}
        id='confirm-password'
        autocomplete='new-password'
        required
        oninput={(e) => { confirmPassword = e.currentTarget.value }}
        placeholder={uiM('change_password_confirm_placeholder')}
        {disabled}
        error={errors.confirmPassword || (!passwordsMatch && confirmPassword ? uiM('change_password_mismatch') : '')}
        showStrength={false}
      />
    </FormField>

    <div class='rounded-lg bg-base-content/3 px-3.5 py-2.5 text-xs text-base-content/50'>
      {uiM('change_password_relogin_hint')}
    </div>

    {#if passwordPolicy}<p class='text-xs text-base-content/60'>{passwordPolicyHint(passwordPolicy)}</p>{/if}

    <Button
      type='submit'
      variant='primary'
      class='disabled:text-base-content/70 w-full sm:w-auto sm:min-w-40'
      disabled={loading || disabled || !canSubmit || Boolean(policyError)}
      {loading}
    >
      {submitText || uiM('change_password_submit')}
    </Button>
  </FormLayout>
</form>
