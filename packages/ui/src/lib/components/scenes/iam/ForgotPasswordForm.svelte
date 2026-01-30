<!--
  =============================================================================
  @hai/ui - ForgotPasswordForm 组件
  =============================================================================
  找回密码表单组件
  
  使用 Svelte 5 Runes ($props, $state, $derived)
  =============================================================================
-->
<script lang="ts">
  import type { ForgotPasswordFormProps, ForgotPasswordFormData } from '../types.js'
  import { cn } from '../../../utils.js'
  
  let {
    loading = false,
    disabled = false,
    mode = 'email',
    submitText = '发送验证码',
    class: className = '',
    errors = {},
    onsubmit,
    header,
    footer,
  }: ForgotPasswordFormProps = $props()
  
  let email = $state('')
  let phone = $state('')
  
  const formClass = $derived(
    cn(
      'forgot-password-form space-y-4',
      className,
    )
  )
  
  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (loading || disabled) return
    
    const data: ForgotPasswordFormData = {
      email: mode === 'email' ? email : undefined,
      phone: mode === 'phone' ? phone : undefined,
    }
    
    await onsubmit?.(data)
  }
</script>

<form class={formClass} onsubmit={handleSubmit}>
  <!-- 自定义头部 -->
  {#if header}
    <div class="forgot-password-form-header">
      {@render header()}
    </div>
  {/if}
  
  <!-- 邮箱输入 -->
  {#if mode === 'email'}
    <div class="form-control">
      <label class="label" for="forgot-email">
        <span class="label-text">邮箱地址</span>
      </label>
      <input
        id="forgot-email"
        type="email"
        name="email"
        placeholder="请输入注册时使用的邮箱"
        class={cn('input input-bordered w-full', errors.email && 'input-error')}
        bind:value={email}
        {disabled}
        required
      />
      {#if errors.email}
        <label class="label">
          <span class="label-text-alt text-error">{errors.email}</span>
        </label>
      {/if}
    </div>
  {:else}
    <div class="form-control">
      <label class="label" for="forgot-phone">
        <span class="label-text">手机号</span>
      </label>
      <input
        id="forgot-phone"
        type="tel"
        name="phone"
        placeholder="请输入注册时使用的手机号"
        class={cn('input input-bordered w-full', errors.phone && 'input-error')}
        bind:value={phone}
        {disabled}
        required
      />
      {#if errors.phone}
        <label class="label">
          <span class="label-text-alt text-error">{errors.phone}</span>
        </label>
      {/if}
    </div>
  {/if}
  
  <!-- 提示信息 -->
  <p class="text-sm text-base-content/60">
    {#if mode === 'email'}
      我们将向您的邮箱发送一封包含重置密码链接的邮件
    {:else}
      我们将向您的手机发送验证码
    {/if}
  </p>
  
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
    disabled={loading || disabled}
  >
    {#if loading}
      <span class="loading loading-spinner loading-sm"></span>
    {/if}
    {submitText}
  </button>
  
  <!-- 自定义底部 -->
  {#if footer}
    <div class="forgot-password-form-footer">
      {@render footer()}
    </div>
  {/if}
</form>
