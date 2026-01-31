<!--
  =============================================================================
  @hai/ui - ForgotPasswordForm 组件
  =============================================================================
  找回密码表单组件
  
  使用 Svelte 5 Runes ($props, $state, $derived)
  使用 primitives/compounds 组件：Input, Button, Alert
  =============================================================================
-->
<script lang="ts">
  import type { ForgotPasswordFormProps, ForgotPasswordFormData } from '../types.js'
  import { cn } from '../../../utils.js'
  import Input from '../../primitives/Input.svelte'
  import Button from '../../primitives/Button.svelte'
  import Alert from '../../compounds/Alert.svelte'
  import { m } from '../../../messages.js'
  
  let {
    loading = false,
    disabled = false,
    showTitle = false,
    showDescription = false,
    mode = 'email',
    showBackLink = false,
    loginUrl = '/login',
    submitText,
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
  <!-- 标题 -->
  {#if showTitle}
    <h2 class="text-2xl font-semibold text-center mb-4">{m('forgot_password_title')}</h2>
  {/if}

  <!-- 描述 -->
  {#if showDescription}
    <p class="text-center text-base-content/60 text-sm mb-6">
      {m('forgot_password_desc')}
    </p>
  {/if}

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
        <span class="label-text">{m('forgot_password_email_label')}</span>
      </label>
      <Input
        id="forgot-email"
        name="email"
        type="email"
        placeholder={m('forgot_password_email_placeholder')}
        bind:value={email}
        {disabled}
        required
        error={errors.email}
      />
    </div>
  {:else}
    <div class="form-control">
      <label class="label" for="forgot-phone">
        <span class="label-text">{m('forgot_password_phone_label')}</span>
      </label>
      <Input
        id="forgot-phone"
        name="phone"
        type="tel"
        placeholder={m('forgot_password_phone_placeholder')}
        bind:value={phone}
        {disabled}
        required
        error={errors.phone}
      />
    </div>
  {/if}
  
  <!-- 提示信息 -->
  <p class="text-sm text-base-content/60">
    {#if mode === 'email'}
      {m('forgot_password_email_hint')}
    {:else}
      {m('forgot_password_phone_hint')}
    {/if}
  </p>
  
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
    {submitText || m('forgot_password_submit')}
  </Button>
  
  <!-- 自定义底部 -->
  {#if footer}
    <div class="forgot-password-form-footer">
      {@render footer()}
    </div>
  {:else if showBackLink}
    <div class="text-center mt-4 text-sm">
      <a href={loginUrl} class="link link-primary">← {m('forgot_password_back')}</a>
    </div>
  {/if}
</form>
