<!--
  =============================================================================
  @hai/ui - ResetPasswordForm 组件
  =============================================================================
  重置密码表单组件（配合验证码/链接使用）
  
  使用 Svelte 5 Runes ($props, $state, $derived)
  =============================================================================
-->
<script lang="ts">
  import type { ResetPasswordFormProps, ResetPasswordFormData } from '../types.js'
  import { cn } from '../../../utils.js'
  import PasswordInput from './PasswordInput.svelte'
  import { arePasswordsEqual } from './password-utils.js'
  
  const defaultLabels = {
    codeLabel: 'Verification Code',
    codePlaceholder: 'Enter verification code',
    newPasswordLabel: 'New Password',
    newPasswordPlaceholder: 'Enter new password',
    confirmPasswordLabel: 'Confirm Password',
    confirmPasswordPlaceholder: 'Re-enter new password',
    passwordMismatch: 'Passwords do not match',
  }
  
  let {
    loading = false,
    disabled = false,
    showCode = true,
    showPasswordStrength = true,
    minPasswordLength = 8,
    submitText = 'Reset Password',
    labels = {},
    strengthLabels = {},
    toggleLabels = {},
    validationMessages = {},
    class: className = '',
    errors = {},
    onsubmit,
  }: ResetPasswordFormProps = $props()
  
  const mergedLabels = $derived({ ...defaultLabels, ...labels })
  
  // 构建 PasswordInput 的 labels
  const passwordInputLabels = $derived({
    showPassword: toggleLabels.showPassword,
    hidePassword: toggleLabels.hidePassword,
    strengthLabel: strengthLabels.label,
    strengthWeak: strengthLabels.weak,
    strengthFair: strengthLabels.medium,
    strengthGood: strengthLabels.strong,
    strengthStrong: strengthLabels.veryStrong,
  })
  
  let code = $state('')
  let newPassword = $state('')
  let confirmPassword = $state('')
  
  const formClass = $derived(
    cn(
      'reset-password-form space-y-4',
      className,
    )
  )
  
  const passwordsMatch = $derived(arePasswordsEqual(newPassword, confirmPassword))
  const canSubmit = $derived(
    (!showCode || code) &&
    newPassword &&
    confirmPassword &&
    passwordsMatch &&
    newPassword.length >= minPasswordLength
  )
  
  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (loading || disabled || !canSubmit) return
    
    const data: ResetPasswordFormData = {
      code: showCode ? code : undefined,
      newPassword,
      confirmPassword,
    }
    
    await onsubmit?.(data)
  }
</script>

<form class={formClass} onsubmit={handleSubmit}>
  <!-- 验证码 -->
  {#if showCode}
    <div class="form-control">
      <label class="label" for="reset-code">
        <span class="label-text">{mergedLabels.codeLabel}</span>
      </label>
      <input
        id="reset-code"
        type="text"
        name="code"
        placeholder={mergedLabels.codePlaceholder}
        class={cn('input input-bordered w-full', errors.code && 'input-error')}
        bind:value={code}
        {disabled}
        required
      />
      {#if errors.code}
        <div class="label">
          <span class="label-text-alt text-error">{errors.code}</span>
        </div>
      {/if}
    </div>
  {/if}
  
  <!-- 新密码 -->
  <div class="form-control">
    <label class="label" for="reset-new-password">
      <span class="label-text">{mergedLabels.newPasswordLabel}</span>
    </label>
    <PasswordInput
      value={newPassword}
      oninput={(e) => { newPassword = e.currentTarget.value }}
      placeholder={mergedLabels.newPasswordPlaceholder}
      {disabled}
      error={errors.newPassword}
      showStrength={showPasswordStrength}
      minLength={minPasswordLength}
      labels={passwordInputLabels}
    />
  </div>
  
  <!-- 确认新密码 -->
  <div class="form-control">
    <label class="label" for="reset-confirm-password">
      <span class="label-text">{mergedLabels.confirmPasswordLabel}</span>
    </label>
    <PasswordInput
      value={confirmPassword}
      oninput={(e) => { confirmPassword = e.currentTarget.value }}
      placeholder={mergedLabels.confirmPasswordPlaceholder}
      {disabled}
      error={errors.confirmPassword || (!passwordsMatch && confirmPassword ? (validationMessages.passwordMismatch || mergedLabels.passwordMismatch) : '')}
      showStrength={false}
      labels={passwordInputLabels}
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
  <button
    type="submit"
    class="btn btn-primary w-full"
    disabled={loading || disabled || !canSubmit}
  >
    {#if loading}
      <span class="loading loading-spinner loading-sm"></span>
    {/if}
    {submitText}
  </button>
</form>
