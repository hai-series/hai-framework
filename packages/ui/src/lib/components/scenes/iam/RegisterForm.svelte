<!--
  @component RegisterForm
  用户注册表单组件，搭配 primitives/compounds 使用。

  @example
  ```ts
  import { mount, unmount } from 'svelte'
  import type { ComponentProps } from 'svelte'
  import { RegisterForm } from '@h-ai/ui'
  const props: ComponentProps<typeof RegisterForm> = { fields: ['username', 'password'], requireConfirmPassword: true }
  const component = mount(RegisterForm, { target: document.body, props })
  await unmount(component)
  ```
-->
<script lang='ts'>
  import type { DataAttributes, InputProps } from '../../../types.js'
  import type { RegisterField, RegisterFormData, RegisterFormProps } from '../types.js'
  import { uiM } from '../../../messages.js'
  import { useToastFeedback } from '../../../toast.svelte.js'
  import { cn, getDataAttributes } from '../../../utils.js'
  import FormField from '../../compounds/FormField.svelte'
  import FormLayout from '../../compounds/FormLayout.svelte'
  import Button from '../../primitives/Button.svelte'
  import Input from '../../primitives/Input.svelte'
  import AgreementNotice from './AgreementNotice.svelte'
  import { passwordPolicyError, passwordPolicyHint } from './password-utils.js'
  import PasswordInput from './PasswordInput.svelte'

  const {
    loading = false,
    columns = 1,
    labelPosition = 'top',
    labelWidth = '8rem',
    disabled = false,
    showTitle = false,
    showPasswordStrength = true,
    requireConfirmPassword = true,
    minPasswordLength = 8,
    passwordPolicy,
    fields = ['username', 'email', 'password'],
    showLoginLink = false,
    loginUrl = '/login',
    agreements,
    submitText,
    class: className = '',
    errors = {},
    onsubmit,
    header,
    extraFields,
    footer,
    ...restProps
  }: RegisterFormProps & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))

  // 表单数据
  let username = $state('')
  let email = $state('')
  let phone = $state('')
  let password = $state('')
  let confirmPassword = $state('')
  let nickname = $state('')

  const policyError = $derived(passwordPolicy && password ? passwordPolicyError(password, passwordPolicy) : '')

  const formClass = $derived(
    cn(
      'register-form space-y-4',
      className,
    ),
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
    !requireConfirmPassword || password === confirmPassword,
  )

  // 确认密码错误提示
  const confirmPasswordError = $derived(
    errors.confirmPassword || (!passwordsMatch && confirmPassword.length > 0
      ? uiM('register_password_mismatch')
      : ''),
  )

  function getSubmittedValue(formData: FormData, key: string, fallback = ''): string | undefined {
    const submitted = formData.get(key)
    const value = typeof submitted === 'string' ? submitted : fallback
    const trimmed = value.trim()
    return trimmed || undefined
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (policyError || loading || disabled)
      return
    if (!passwordsMatch)
      return

    const submittedFormData = new FormData(e.currentTarget as HTMLFormElement)

    const data: RegisterFormData = {
      username: getSubmittedValue(submittedFormData, 'username', username),
      email: getSubmittedValue(submittedFormData, 'email', email),
      phone: getSubmittedValue(submittedFormData, 'phone', phone),
      password,
      confirmPassword: requireConfirmPassword ? confirmPassword : undefined,
      nickname: getSubmittedValue(submittedFormData, 'nickname', nickname),
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
      case 'username':
        username = value
        break
      case 'email':
        email = value
        break
      case 'phone':
        phone = value
        break
      case 'nickname':
        nickname = value
        break
    }
  }
  useToastFeedback(() => errors.general)
</script>

<form {...dataAttributes} class={formClass} onsubmit={handleSubmit}>
  <FormLayout {columns} {labelPosition} {labelWidth}>
    <!-- 标题 -->
    {#if showTitle}
      <h2 class='text-xl font-semibold text-center mb-5'>{uiM('register_title')}</h2>
    {/if}

    <!-- 自定义头部 -->
    {#if header}
      <div class='register-form-header'>
        {@render header()}
      </div>
    {/if}

    {#if passwordPolicy}<p class='text-xs text-base-content/60'>{passwordPolicyHint(passwordPolicy)}</p>{/if}
    {#if policyError}<p role='alert' class='text-sm text-error'>{policyError}</p>{/if}

    <!-- 动态字段 -->
    {#each fields as field (field)}
      {#if field === 'password'}
        <!-- 密码字段 -->
        <FormField for='register-password' label={getFieldLabel('password')}>
          <PasswordInput
            id='register-password'
            bind:value={password}
            placeholder={getFieldPlaceholder('password')}
            autocomplete='new-password'
            {disabled}
            required
            showStrength={showPasswordStrength}
            minLength={minPasswordLength}
            error={errors.password}
          />
        </FormField>

        <!-- 确认密码字段 -->
        {#if requireConfirmPassword}
          <FormField for='register-confirm-password' label={getFieldLabel('confirmPassword')}>
            <PasswordInput
              id='register-confirm-password'
              bind:value={confirmPassword}
              placeholder={getFieldPlaceholder('confirmPassword')}
              autocomplete='new-password'
              {disabled}
              required
              showStrength={false}
              error={confirmPasswordError}
            />
          </FormField>
        {/if}
      {:else if field !== 'confirmPassword'}
        <FormField for='register-{field}' label={getFieldLabel(field)}>
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
        </FormField>
      {/if}
    {/each}

    <!-- 通用错误 -->
    {#if extraFields}
      <div class='register-form-extra-fields'>{@render extraFields()}</div>
    {/if}

    <!-- 提交按钮 -->
    <Button
      type='submit'
      variant='primary'
      class='disabled:text-base-content/70 w-full'
      disabled={loading || disabled || !passwordsMatch || Boolean(policyError)}
      loading={loading}
    >
      {submitText || uiM('register_submit')}
    </Button>

    <!-- 协议提示 -->
    <AgreementNotice {agreements} />

    <!-- 自定义底部 -->
    {#if footer}
      <div class='register-form-footer'>
        {@render footer()}
      </div>
    {:else if showLoginLink}
      <div class='text-center mt-4 text-sm text-base-content/60'>
        <span>{uiM('register_has_account')}</span>
        <a href={loginUrl} class='link link-primary ml-1'>{uiM('register_login_now')}</a>
      </div>
    {/if}
  </FormLayout>
</form>
