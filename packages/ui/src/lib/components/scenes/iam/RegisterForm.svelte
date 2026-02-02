<!--
  =============================================================================
  @hai/ui - RegisterForm 组件
  =============================================================================
  用户注册表单组件
  
  使用 Svelte 5 Runes ($props, $state, $derived)
  使用 PasswordInput 组件处理密码输入
  =============================================================================
-->
<script lang="ts">
  import Button from '../../primitives/Button.svelte'
  import Input from '../../primitives/Input.svelte'
  import type { RegisterFormProps, RegisterFormData, RegisterField } from '../types.js'
  import type { InputProps } from '../../../types.js'
  import { cn } from '../../../utils.js'
  import PasswordInput from './PasswordInput.svelte'
  import { m } from '../../../messages.js'
  
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
    submitText,
    class: className = '',
    errors = {},
    onsubmit,
    header,
    footer,
  }: RegisterFormProps = $props()
  
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
      username: () => m('register_username'),
      email: () => m('register_email'),
      phone: () => m('register_phone'),
      password: () => m('register_password'),
      confirmPassword: () => m('register_confirm_password'),
      nickname: () => m('register_nickname'),
    }
    return labelMap[field]?.() || field
  }
  
  // 获取字段占位符
  function getFieldPlaceholder(field: RegisterField): string {
    const placeholderMap: Record<RegisterField, () => string> = {
      username: () => m('register_username_placeholder'),
      email: () => m('register_email_placeholder'),
      phone: () => m('register_phone_placeholder'),
      password: () => m('register_password_placeholder'),
      confirmPassword: () => m('register_confirm_password_placeholder'),
      nickname: () => m('register_nickname_placeholder'),
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
      ? m('register_password_mismatch')
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
    <h2 class="text-2xl font-semibold text-center mb-6">{m('register_title')}</h2>
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
      <div class="form-control">
        <label class="label" for="register-password">
          <span class="label-text">{getFieldLabel('password')}</span>
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
        <div class="form-control">
          <label class="label" for="register-confirm-password">
            <span class="label-text">{getFieldLabel('confirmPassword')}</span>
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
      <div class="form-control">
        <label class="label" for="register-{field}">
          <span class="label-text">{getFieldLabel(field)}</span>
        </label>
        <Input
          id={`register-${field}`}
          type={getFieldType(field)}
          name={field}
          placeholder={getFieldPlaceholder(field)}
          class={errors[field] ? 'input-error' : ''}
          value={getFieldValue(field)}
          oninput={(e: Event & { currentTarget: HTMLInputElement }) => setFieldValue(field, e.currentTarget.value)}
          {disabled}
          required={field === 'username' || field === 'email'}
          autocomplete={field === 'username' ? 'username' : field === 'email' ? 'email' : undefined}
        />
        {#if errors[field]}
          <div class="label">
            <span class="label-text-alt text-error">{errors[field]}</span>
          </div>
        {/if}
      </div>
    {/if}
  {/each}
  
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
    disabled={loading || disabled || !passwordsMatch}
    loading={loading}
  >
    {submitText || m('register_submit')}
  </Button>
  
  <!-- 自定义底部 -->
  {#if footer}
    <div class="register-form-footer">
      {@render footer()}
    </div>
  {:else if showLoginLink}
    <div class="text-center mt-4 text-sm text-base-content/60">
      <span>{m('register_has_account')}</span>
      <a href={loginUrl} class="link link-primary ml-1">{m('register_login_now')}</a>
    </div>
  {/if}
</form>
