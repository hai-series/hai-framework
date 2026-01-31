<!--
  =============================================================================
  @hai/ui - LoginForm 组件
  =============================================================================
  用户登录表单组件
  
  使用 Svelte 5 Runes ($props, $state)
  支持自定义验证消息（validationMessages）实现 i18n
  =============================================================================
-->
<script lang="ts">
  import type { LoginFormProps, LoginFormData } from '../types.js'
  import { cn } from '../../../utils.js'
  import PasswordInput from './PasswordInput.svelte'
  
  const defaultToggleLabels = {
    showPassword: 'Show password',
    hidePassword: 'Hide password',
  }
  
  let {
    loading = false,
    disabled = false,
    showRememberMe = true,
    showForgotPassword = true,
    forgotPasswordUrl = '/forgot-password',
    usernameLabel = 'Username / Email',
    usernamePlaceholder = 'Enter username or email',
    passwordLabel = 'Password',
    passwordPlaceholder = 'Enter password',
    rememberMeLabel = 'Remember me',
    forgotPasswordLabel = 'Forgot password?',
    submitText = 'Login',
    toggleLabels = {},
    validationMessages = {},
    class: className = '',
    errors = {},
    onsubmit,
    onforgotpassword,
    header,
    footer,
  }: LoginFormProps = $props()
  
  const mergedToggleLabels = $derived({ ...defaultToggleLabels, ...toggleLabels })
  
  let username = $state('')
  let password = $state('')
  let rememberMe = $state(false)
  let usernameRef: HTMLInputElement | undefined = $state()
  let passwordRef: HTMLInputElement | undefined = $state()
  
  const formClass = $derived(
    cn(
      'login-form space-y-4',
      className,
    )
  )
  
  // 设置自定义验证消息
  $effect(() => {
    if (usernameRef && validationMessages.required) {
      usernameRef.setCustomValidity('')
    }
    if (passwordRef && validationMessages.required) {
      passwordRef.setCustomValidity('')
    }
  })
  
  function handleInvalid(e: Event & { currentTarget: HTMLInputElement }) {
    if (validationMessages.required && e.currentTarget.validity.valueMissing) {
      e.currentTarget.setCustomValidity(validationMessages.required)
    }
  }
  
  function handleInput(e: Event & { currentTarget: HTMLInputElement }) {
    // 清除自定义验证消息，让浏览器重新验证
    e.currentTarget.setCustomValidity('')
  }
  
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
      bind:this={usernameRef}
      id="login-username"
      type="text"
      name="username"
      placeholder={usernamePlaceholder}
      class={cn('input input-bordered w-full', errors.username && 'input-error')}
      bind:value={username}
      oninput={handleInput}
      oninvalid={handleInvalid}
      {disabled}
      required
    />
    {#if errors.username}
      <div class="label">
        <span class="label-text-alt text-error">{errors.username}</span>
      </div>
    {/if}
  </div>
  
  <!-- 密码 -->
  <div class="form-control">
    <label class="label" for="login-password">
      <span class="label-text">{passwordLabel}</span>
    </label>
    <PasswordInput
      bind:inputRef={passwordRef}
      value={password}
      oninput={(e) => { 
        password = e.currentTarget.value
        handleInput(e)
      }}
      oninvalid={handleInvalid}
      placeholder={passwordPlaceholder}
      {disabled}
      error={errors.password}
      showStrength={false}
      labels={{
        showPassword: mergedToggleLabels.showPassword,
        hidePassword: mergedToggleLabels.hidePassword,
      }}
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
          <span class="label-text">{rememberMeLabel}</span>
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
            {forgotPasswordLabel}
          </button>
        {:else}
          <a href={forgotPasswordUrl} class="link link-primary text-sm">
            {forgotPasswordLabel}
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
