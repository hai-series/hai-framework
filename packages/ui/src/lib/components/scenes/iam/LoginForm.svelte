<!--
  =============================================================================
  @hai/ui - LoginForm 组件
  =============================================================================
  用户登录表单组件
  
  使用 Svelte 5 Runes ($props, $state)
  =============================================================================
-->
<script lang="ts">
  import type { LoginFormProps, LoginFormData } from '../types.js'
  import { cn } from '../../../utils.js'
  import PasswordInput from './PasswordInput.svelte'
  
  let {
    loading = false,
    disabled = false,
    showRememberMe = true,
    showForgotPassword = true,
    forgotPasswordUrl = '/forgot-password',
    usernameLabel = '用户名',
    usernamePlaceholder = '请输入用户名或邮箱',
    passwordLabel = '密码',
    passwordPlaceholder = '请输入密码',
    submitText = '登录',
    class: className = '',
    errors = {},
    onsubmit,
    onforgotpassword,
    header,
    footer,
  }: LoginFormProps = $props()
  
  let username = $state('')
  let password = $state('')
  let rememberMe = $state(false)
  
  const formClass = $derived(
    cn(
      'login-form space-y-4',
      className,
    )
  )
  
  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (loading || disabled) return
    
    const data: LoginFormData = {
      username,
      password,
      rememberMe,
    }
    
    await onsubmit?.(data)
  }
  
  function handleForgotPassword() {
    onforgotpassword?.()
  }
</script>

<form class={formClass} onsubmit={handleSubmit}>
  <!-- 自定义头部 -->
  {#if header}
    <div class="login-form-header">
      {@render header()}
    </div>
  {/if}
  
  <!-- 用户名 -->
  <div class="form-control">
    <label class="label" for="login-username">
      <span class="label-text">{usernameLabel}</span>
    </label>
    <input
      id="login-username"
      type="text"
      name="username"
      placeholder={usernamePlaceholder}
      class={cn('input input-bordered w-full', errors.username && 'input-error')}
      bind:value={username}
      {disabled}
      required
    />
    {#if errors.username}
      <label class="label">
        <span class="label-text-alt text-error">{errors.username}</span>
      </label>
    {/if}
  </div>
  
  <!-- 密码 -->
  <div class="form-control">
    <label class="label" for="login-password">
      <span class="label-text">{passwordLabel}</span>
    </label>
    <PasswordInput
      bind:value={password}
      placeholder={passwordPlaceholder}
      {disabled}
      error={errors.password}
      showStrength={false}
    />
  </div>
  
  <!-- 记住我 & 忘记密码 -->
  {#if showRememberMe || showForgotPassword}
    <div class="flex items-center justify-between">
      {#if showRememberMe}
        <label class="label cursor-pointer gap-2">
          <input
            type="checkbox"
            name="rememberMe"
            class="checkbox checkbox-sm"
            bind:checked={rememberMe}
            {disabled}
          />
          <span class="label-text">记住我</span>
        </label>
      {:else}
        <div></div>
      {/if}
      
      {#if showForgotPassword}
        {#if onforgotpassword}
          <button
            type="button"
            class="link link-primary text-sm"
            onclick={handleForgotPassword}
          >
            忘记密码？
          </button>
        {:else}
          <a href={forgotPasswordUrl} class="link link-primary text-sm">
            忘记密码？
          </a>
        {/if}
      {/if}
    </div>
  {/if}
  
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
    <div class="login-form-footer">
      {@render footer()}
    </div>
  {/if}
</form>
