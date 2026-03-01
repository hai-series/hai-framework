<!--
  @component ResetPasswordForm
  重置密码表单组件（配合验证码/链接使用）。
-->
<script lang="ts">
  import type { ResetPasswordFormProps, ResetPasswordFormData } from '../types.js'
  import { cn } from '../../../utils.js'
  import PasswordInput from './PasswordInput.svelte'
  import { arePasswordsEqual } from './password-utils.js'
  import Input from '../../primitives/Input.svelte'
  import Button from '../../primitives/Button.svelte'
  import Alert from '../../compounds/Alert.svelte'
  import { m } from '../../../messages.js'
  
  let {
    loading = false,
    disabled = false,
    showTitle = false,
    showDescription = false,
    showCode = true,
    showPasswordStrength = true,
    minPasswordLength = 8,
    showBackLink = false,
    loginUrl = '/login',
    submitText,
    class: className = '',
    errors = {},
    onsubmit,
  }: ResetPasswordFormProps = $props()
  
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
  <!-- 标题 -->
  {#if showTitle}
    <h2 class="text-xl font-semibold text-center mb-4">{m('reset_password_title')}</h2>
  {/if}

  <!-- 描述 -->
  {#if showDescription}
    <p class="text-center text-base-content/45 text-sm mb-5">
      {m('reset_password_desc')}
    </p>
  {/if}

  <!-- 验证码 -->
  {#if showCode}
    <div class="space-y-1.5">
      <label class="text-sm font-medium text-base-content/70" for="reset-code">
        {m('reset_password_code_label')}
      </label>
      <Input
        id="reset-code"
        name="code"
        type="text"
        placeholder={m('reset_password_code_placeholder')}
        bind:value={code}
        {disabled}
        required
        error={errors.code}
      />
    </div>
  {/if}
  
  <!-- 新密码 -->
  <div class="space-y-1.5">
    <label class="text-sm font-medium text-base-content/70" for="reset-new-password">
      {m('reset_password_new_label')}
    </label>
    <PasswordInput
      bind:value={newPassword}
      placeholder={m('reset_password_new_placeholder')}
      {disabled}
      error={errors.newPassword}
      showStrength={showPasswordStrength}
      minLength={minPasswordLength}
    />
  </div>
  
  <!-- 确认新密码 -->
  <div class="space-y-1.5">
    <label class="text-sm font-medium text-base-content/70" for="reset-confirm-password">
      {m('reset_password_confirm_label')}
    </label>
    <PasswordInput
      bind:value={confirmPassword}
      placeholder={m('reset_password_confirm_placeholder')}
      {disabled}
      error={errors.confirmPassword || (!passwordsMatch && confirmPassword ? m('reset_password_mismatch') : '')}
      showStrength={false}
    />
  </div>
  
  <!-- 通用错误 -->
  {#if errors.general}
    <Alert variant="error">
      {errors.general}
    </Alert>
  {/if}
  
  <!-- 提交按钮 -->
  <Button
    type="submit"
    variant="primary"
    {loading}
    disabled={loading || disabled || !canSubmit}
    class="w-full"
  >
    {submitText || m('reset_password_submit')}
  </Button>

  <!-- 返回链接 -->
  {#if showBackLink}
    <div class="text-center mt-4 text-sm">
      <a href={loginUrl} class="link link-primary">← {m('reset_password_back')}</a>
    </div>
  {/if}
</form>
