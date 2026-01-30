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
  
  let {
    loading = false,
    disabled = false,
    requireOldPassword = true,
    showPasswordStrength = true,
    minPasswordLength = 8,
    submitText = '修改密码',
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
  
  const passwordsMatch = $derived(newPassword === confirmPassword)
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
        <span class="label-text">当前密码</span>
      </label>
      <PasswordInput
        bind:value={oldPassword}
        placeholder="请输入当前密码"
        {disabled}
        error={errors.oldPassword}
        showStrength={false}
      />
    </div>
  {/if}
  
  <!-- 新密码 -->
  <div class="form-control">
    <label class="label" for="new-password">
      <span class="label-text">新密码</span>
    </label>
    <PasswordInput
      bind:value={newPassword}
      placeholder="请输入新密码"
      {disabled}
      error={errors.newPassword}
      showStrength={showPasswordStrength}
      minLength={minPasswordLength}
    />
  </div>
  
  <!-- 确认新密码 -->
  <div class="form-control">
    <label class="label" for="confirm-password">
      <span class="label-text">确认新密码</span>
    </label>
    <PasswordInput
      bind:value={confirmPassword}
      placeholder="请再次输入新密码"
      {disabled}
      error={errors.confirmPassword || (!passwordsMatch && confirmPassword ? '两次密码输入不一致' : '')}
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
