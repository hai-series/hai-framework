<!--
  @component LoginForm
  用户登录表单组件，搭配 primitives/compounds 使用。
-->
<script lang="ts">
  import type { LoginFormProps, LoginFormData } from '../types.js'
  import { cn } from '../../../utils.js'
  import PasswordInput from './PasswordInput.svelte'
  import Input from '../../primitives/Input.svelte'
  import Button from '../../primitives/Button.svelte'
  import BareButton from '../../primitives/BareButton.svelte'
  import Checkbox from '../../primitives/Checkbox.svelte'
  import Alert from '../../compounds/Alert.svelte'
  import { uiM } from '../../../messages.js'
  
  let {
    loading = false,
    disabled = false,
    showTitle = false,
    showRememberMe = true,
    showForgotPassword = true,
    forgotPasswordUrl = '/forgot-password',
    showRegisterLink = false,
    registerUrl = '/register',
    agreements,
    submitText,
    class: className = '',
    errors = {},
    onsubmit,
    onforgotpassword,
    header,
    footer,
  }: LoginFormProps = $props()

  const hasAgreements = $derived(
    !!(agreements?.userAgreementUrl || agreements?.privacyPolicyUrl)
  )
  
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
  <!-- 标题 -->
  {#if showTitle}
    <h2 class="text-xl font-semibold text-center mb-5">{uiM('login_title')}</h2>
  {/if}

  <!-- 自定义头部 -->
  {#if header}
    <div class="login-form-header">
      {@render header()}
    </div>
  {/if}
  
  <!-- 用户名 -->
  <div class="space-y-1.5">
    <label class="text-sm font-medium text-base-content/70" for="login-username">
      {uiM('login_username')}
    </label>
    <Input
      id="login-username"
      name="username"
      type="text"
      placeholder={uiM('login_username_placeholder')}
      bind:value={username}
      {disabled}
      required
      error={errors.username}
    />
  </div>
  
  <!-- 密码 -->
  <div class="space-y-1.5">
    <label class="text-sm font-medium text-base-content/70" for="login-password">
      {uiM('login_password')}
    </label>
    <PasswordInput
      bind:value={password}
      placeholder={uiM('login_password_placeholder')}
      {disabled}
      required
      error={errors.password}
      showStrength={false}
    />
  </div>
  
  <!-- 记住我 & 忘记密码 -->
  {#if showRememberMe || showForgotPassword}
    <div class="flex items-center justify-between">
      {#if showRememberMe}
        <Checkbox
          bind:checked={rememberMe}
          label={uiM('login_remember_me')}
          {disabled}
          size="sm"
        />
      {:else}
        <div></div>
      {/if}
      
      {#if showForgotPassword}
        {#if onforgotpassword}
          <BareButton
            type="button"
            class="link link-primary text-sm"
            onclick={handleForgotPassword}
          >
            {uiM('login_forgot_password')}
          </BareButton>
        {:else}
          <a href={forgotPasswordUrl} class="link link-primary text-sm">
            {uiM('login_forgot_password')}
          </a>
        {/if}
      {/if}
    </div>
  {/if}
  
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
    disabled={loading || disabled}
    class="w-full"
  >
    {submitText || uiM('login_submit')}
  </Button>

  <!-- 协议提示 -->
  {#if hasAgreements}
    <p class="text-xs text-base-content/50 text-center">
      {uiM('agreement_prefix')}
      {#if agreements?.userAgreementUrl}
        <a href={agreements.userAgreementUrl} target="_blank" rel="noopener noreferrer" class="link link-primary">{uiM('agreement_user_agreement')}</a>
      {/if}
      {#if agreements?.userAgreementUrl && agreements?.privacyPolicyUrl}
        {uiM('agreement_and')}
      {/if}
      {#if agreements?.privacyPolicyUrl}
        <a href={agreements.privacyPolicyUrl} target="_blank" rel="noopener noreferrer" class="link link-primary">{uiM('agreement_privacy_policy')}</a>
      {/if}
    </p>
  {/if}
  
  <!-- 自定义底部 -->
  {#if footer}
    <div class="login-form-footer">
      {@render footer()}
    </div>
  {:else if showRegisterLink}
    <div class="text-center mt-4 text-sm text-base-content/60">
      <span>{uiM('login_no_account')}</span>
      <a href={registerUrl} class="link link-primary ml-1">{uiM('login_register_now')}</a>
    </div>
  {/if}
</form>
