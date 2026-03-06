<!--
  @component RegisterForm
  用户注册表单组件，搭配 primitives/compounds 使用。
-->
<script lang="ts">
  import Button from '../../primitives/Button.svelte'
  import Input from '../../primitives/Input.svelte'
  import Alert from '../../compounds/Alert.svelte'
  import type { RegisterFormProps, RegisterFormData, RegisterField } from '../types.js'
  import type { InputProps } from '../../../types.js'
  import { cn } from '../../../utils.js'
  import PasswordInput from './PasswordInput.svelte'
  import { uiM } from '../../../messages.js'
  
  let {
    loading = false,
    disabled = false,
    showTitle = false,
    showPasswordStrength = true,
    requireConfirmPassword = true,
    minPasswordLength = 8,
    fields = ['username', 'email', 'password'],
    showLoginLink = false,
    loginUrl = '/login',
    agreements,
    submitText,
    class: className = '',
    errors = {},
    onsubmit,
    header,
    footer,
  }: RegisterFormProps = $props()

  const hasAgreements = $derived(
    !!(agreements?.userAgreementUrl || agreements?.privacyPolicyUrl)
  )
  
  // 表单数据
  let username = $state('')
  let email = $state('')
  let phone = $state('')
  let password = $state('')
  let confirmPassword = $state('')
  let nickname = $state('')
  
  const formClass = $derived(
    cn(
      'register-form space-y-4',
      className,
    )
  )
  
  // 获取字段标签
  function getFieldLabel(field: RegisterField): string {
    const labelMap: Record<RegisterField, () => string> = {
      username: () => uiM('register_username'),
      email: () => uiM('register_email'),
      phone: () => uiM('register_phone'),
      password: () => uiM('register_password'),
      confirmPassword: () => uiM('register_confirm_password'),
      nickname: () => uiM('register_nickname'),
    }
    return labelMap[field]?.() || field
  }
  
  // 获取字段占位符
  function getFieldPlaceholder(field: RegisterField): string {
    const placeholderMap: Record<RegisterField, () => string> = {
      username: () => uiM('register_username_placeholder'),
      email: () => uiM('register_email_placeholder'),
      phone: () => uiM('register_phone_placeholder'),
      password: () => uiM('register_password_placeholder'),
      confirmPassword: () => uiM('register_confirm_password_placeholder'),
      nickname: () => uiM('register_nickname_placeholder'),
    }
    return placeholderMap[field]?.() || ''
  }
  
  // 获取字段类型
  function getFieldType(field: RegisterField): InputProps['type'] {
    const typeMap: Record<RegisterField, InputProps['type']> = {
      username: 'text',
      email: 'email',
      phone: 'tel',
      password: 'password',
      confirmPassword: 'password',
      nickname: 'text',
    }
    return typeMap[field] ?? 'text'
  }
  
  // 检查密码是否匹配
  const passwordsMatch = $derived(
    !requireConfirmPassword || password === confirmPassword
  )
  
  // 确认密码错误提示
  const confirmPasswordError = $derived(
    errors.confirmPassword || (!passwordsMatch && confirmPassword.length > 0 
      ? uiM('register_password_mismatch')
      : '')
  )
  
  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (loading || disabled) return
    if (!passwordsMatch) return
    
    const data: RegisterFormData = {
      username,
      email,
      phone,
      password,
      confirmPassword: requireConfirmPassword ? confirmPassword : undefined,
      nickname,
    }
    
    await onsubmit?.(data)
  }
  
  // 获取字段值
  function getFieldValue(field: RegisterField): string {
    switch (field) {
      case 'username': return username
      case 'email': return email
      case 'phone': return phone
      case 'nickname': return nickname
      default: return ''
    }
  }
  
  // 设置字段值
  function setFieldValue(field: RegisterField, value: string) {
    switch (field) {
      case 'username': username = value; break
      case 'email': email = value; break
      case 'phone': phone = value; break
      case 'nickname': nickname = value; break
    }
  }
</script>

<form class={formClass} onsubmit={handleSubmit}>
  <!-- 标题 -->
  {#if showTitle}
    <h2 class="text-xl font-semibold text-center mb-5">{uiM('register_title')}</h2>
  {/if}

  <!-- 自定义头部 -->
  {#if header}
    <div class="register-form-header">
      {@render header()}
    </div>
  {/if}
  
  <!-- 动态字段 -->
  {#each fields as field (field)}
    {#if field === 'password'}
      <!-- 密码字段 -->
      <div class="space-y-1.5">
        <label class="text-sm font-medium text-base-content/70" for="register-password">
          {getFieldLabel('password')}
        </label>
        <PasswordInput
          id="register-password"
          bind:value={password}
          placeholder={getFieldPlaceholder('password')}
          {disabled}
          required
          showStrength={showPasswordStrength}
          minLength={minPasswordLength}
          error={errors.password}
        />
      </div>
      
      <!-- 确认密码字段 -->
      {#if requireConfirmPassword}
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-base-content/70" for="register-confirm-password">
            {getFieldLabel('confirmPassword')}
          </label>
          <PasswordInput
            id="register-confirm-password"
            bind:value={confirmPassword}
            placeholder={getFieldPlaceholder('confirmPassword')}
            {disabled}
            required
            showStrength={false}
            error={confirmPasswordError}
          />
        </div>
      {/if}
    {:else if field !== 'confirmPassword'}
      <div class="space-y-1.5">
        <label class="text-sm font-medium text-base-content/70" for="register-{field}">
          {getFieldLabel(field)}
        </label>
        <Input
          id={`register-${field}`}
          type={getFieldType(field)}
          name={field}
          placeholder={getFieldPlaceholder(field)}
          value={getFieldValue(field)}
          oninput={(e: Event & { currentTarget: HTMLInputElement }) => setFieldValue(field, e.currentTarget.value)}
          {disabled}
          required={field === 'username' || field === 'email'}
          autocomplete={field === 'username' ? 'username' : field === 'email' ? 'email' : undefined}
          error={errors[field]}
        />
      </div>
    {/if}
  {/each}
  
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
    class="w-full"
    disabled={loading || disabled || !passwordsMatch}
    loading={loading}
  >
    {submitText || uiM('register_submit')}
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
    <div class="register-form-footer">
      {@render footer()}
    </div>
  {:else if showLoginLink}
    <div class="text-center mt-4 text-sm text-base-content/60">
      <span>{uiM('register_has_account')}</span>
      <a href={loginUrl} class="link link-primary ml-1">{uiM('register_login_now')}</a>
    </div>
  {/if}
</form>
