<!--
  =============================================================================
  @hai/ui - ChangePasswordForm 组件
  =============================================================================
  修改密码表单组件
  
  使用 Svelte 5 Runes ($props, $state, $derived)
  =============================================================================
-->
<script lang="ts">
  import type { ChangePasswordFormProps, ChangePasswordFormData } from '../types.js'
  import { cn } from '../../../utils.js'
  import PasswordInput from './PasswordInput.svelte'
  import Button from '../../primitives/Button.svelte'
  import { arePasswordsEqual } from './password-utils.js'
  import { m } from '../../../messages.js'
  
  let {
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
      'change-password-form space-y-4',
      className,
    )
  )
  
  const passwordsMatch = $derived(arePasswordsEqual(newPassword, confirmPassword))
  const canSubmit = $derived(
    (!requireOldPassword || oldPassword) &&
    newPassword &&
    confirmPassword &&
    passwordsMatch &&
    newPassword.length >= minPasswordLength
  )
  
  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (loading || disabled || !canSubmit) return
    
    const data: ChangePasswordFormData = {
      oldPassword: requireOldPassword ? oldPassword : undefined,
      newPassword,
      confirmPassword,
    }
    
    await onsubmit?.(data)
  }
</script>

<form class={formClass} onsubmit={handleSubmit}>
  <!-- 旧密码 -->
  {#if requireOldPassword}
    <div class="form-control">
      <label class="label" for="old-password">
        <span class="label-text">{m('change_password_old')}</span>
      </label>
      <PasswordInput
        value={oldPassword}
        oninput={(e) => { oldPassword = e.currentTarget.value }}
        placeholder={m('change_password_old_placeholder')}
        {disabled}
        error={errors.oldPassword}
        showStrength={false}
      />
    </div>
  {/if}
  
  <!-- 新密码 -->
  <div class="form-control">
    <label class="label" for="new-password">
      <span class="label-text">{m('change_password_new')}</span>
    </label>
    <PasswordInput
      value={newPassword}
      oninput={(e) => { newPassword = e.currentTarget.value }}
      placeholder={m('change_password_new_placeholder')}
      {disabled}
      error={errors.newPassword}
      showStrength={showPasswordStrength}
      minLength={minPasswordLength}
    />
  </div>
  
  <!-- 确认新密码 -->
  <div class="form-control">
    <label class="label" for="confirm-password">
      <span class="label-text">{m('change_password_confirm')}</span>
    </label>
    <PasswordInput
      value={confirmPassword}
      oninput={(e) => { confirmPassword = e.currentTarget.value }}
      placeholder={m('change_password_confirm_placeholder')}
      {disabled}
      error={errors.confirmPassword || (!passwordsMatch && confirmPassword ? m('change_password_mismatch') : '')}
      showStrength={false}
    />
  </div>
  
  <!-- 通用错误 -->
  {#if errors.general}
    <div class="alert alert-error">
      <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>{errors.general}</span>
    </div>
  {/if}
  
  <!-- 提交按钮 -->
  <Button
    type="submit"
    variant="primary"
    class="w-full"
    disabled={loading || disabled || !canSubmit}
    {loading}
  >
    {submitText || m('change_password_submit')}
  </Button>
</form>
