<!--
  @component ChangePasswordForm
  修改密码表单组件。
-->
<script lang='ts'>
  import type { ChangePasswordFormData, ChangePasswordFormProps } from '../types.js'
  import { uiM } from '../../../messages.js'
  import { cn } from '../../../utils.js'
  import Alert from '../../compounds/Alert.svelte'
  import Button from '../../primitives/Button.svelte'
  import { arePasswordsEqual } from './password-utils.js'
  import PasswordInput from './PasswordInput.svelte'

  const {
    loading = false,
    disabled = false,
    requireOldPassword = true,
    showPasswordStrength = true,
    minPasswordLength = 8,
    submitText,
    class: className = '',
    errors = {},
    onsubmit,
  }: ChangePasswordFormProps = $props()

  let oldPassword = $state('')
  let newPassword = $state('')
  let confirmPassword = $state('')

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
    if (loading || disabled || !canSubmit)
      return

    const data: ChangePasswordFormData = {
      oldPassword: requireOldPassword ? oldPassword : undefined,
      newPassword,
      confirmPassword,
    }

    await onsubmit?.(data)
  }
</script>

<form class={formClass} onsubmit={handleSubmit}>
  {#if requireOldPassword}
    <div class='space-y-1.5'>
      <label class='text-sm font-medium text-base-content/70' for='old-password'>
        {uiM('change_password_old')}
      </label>
      <PasswordInput
        value={oldPassword}
        oninput={(e) => { oldPassword = e.currentTarget.value }}
        placeholder={uiM('change_password_old_placeholder')}
        {disabled}
        error={errors.oldPassword}
        showStrength={false}
      />
    </div>
  {/if}

  <div class='space-y-1.5'>
    <label class='text-sm font-medium text-base-content/70' for='new-password'>
      {uiM('change_password_new')}
    </label>
    <PasswordInput
      value={newPassword}
      oninput={(e) => { newPassword = e.currentTarget.value }}
      placeholder={uiM('change_password_new_placeholder')}
      {disabled}
      error={errors.newPassword}
      showStrength={showPasswordStrength}
      minLength={minPasswordLength}
    />
  </div>

  <div class='space-y-1.5'>
    <label class='text-sm font-medium text-base-content/70' for='confirm-password'>
      {uiM('change_password_confirm')}
    </label>
    <PasswordInput
      value={confirmPassword}
      oninput={(e) => { confirmPassword = e.currentTarget.value }}
      placeholder={uiM('change_password_confirm_placeholder')}
      {disabled}
      error={errors.confirmPassword || (!passwordsMatch && confirmPassword ? uiM('change_password_mismatch') : '')}
      showStrength={false}
    />
  </div>

  <div class='rounded-lg bg-base-content/3 px-3.5 py-2.5 text-xs text-base-content/50'>
    {uiM('change_password_relogin_hint')}
  </div>

  {#if errors.general}
    <Alert variant='error'>
      {errors.general}
    </Alert>
  {/if}

  <Button
    type='submit'
    variant='primary'
    class='w-full sm:w-auto sm:min-w-40'
    disabled={loading || disabled || !canSubmit}
    {loading}
  >
    {submitText || uiM('change_password_submit')}
  </Button>
</form>
