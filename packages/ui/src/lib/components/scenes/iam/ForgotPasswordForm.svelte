<!--
  @component ForgotPasswordForm
  =============================================================================
  @h-ai/ui - ForgotPasswordForm 组件
  =============================================================================
  找回密码表单组件

  使用 Svelte 5 Runes ($props, $state, $derived)
  使用 primitives/compounds 组件：Input, Button, Alert
  =============================================================================

  @example
  ```ts
  import { mount, unmount } from 'svelte'
  import type { ComponentProps } from 'svelte'
  import { ForgotPasswordForm } from '@h-ai/ui'
  const props: ComponentProps<typeof ForgotPasswordForm> = { mode: 'email' }
  const component = mount(ForgotPasswordForm, { target: document.body, props })
  await unmount(component)
  ```
-->
<script lang='ts'>
  import type { DataAttributes } from '../../../types.js'
  import type { ForgotPasswordFormData, ForgotPasswordFormProps } from '../types.js'
  import { uiM } from '../../../messages.js'
  import { cn, getDataAttributes } from '../../../utils.js'
  import Alert from '../../compounds/Alert.svelte'
  import FormField from '../../compounds/FormField.svelte'
  import FormLayout from '../../compounds/FormLayout.svelte'
  import Button from '../../primitives/Button.svelte'
  import Input from '../../primitives/Input.svelte'

  const {
    loading = false,
    columns = 1,
    labelPosition = 'top',
    labelWidth = '8rem',
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
    ...restProps
  }: ForgotPasswordFormProps & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
  let email = $state('')
  let phone = $state('')

  const formClass = $derived(
    cn(
      'forgot-password-form space-y-4',
      className,
    ),
  )

  function getSubmittedValue(formData: FormData, key: string, fallback = ''): string | undefined {
    const submitted = formData.get(key)
    const value = typeof submitted === 'string' ? submitted : fallback
    const trimmed = value.trim()
    return trimmed || undefined
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (loading || disabled)
      return

    const submittedFormData = new FormData(e.currentTarget as HTMLFormElement)

    const data: ForgotPasswordFormData = {
      email: mode === 'email' ? getSubmittedValue(submittedFormData, 'email', email) : undefined,
      phone: mode === 'phone' ? getSubmittedValue(submittedFormData, 'phone', phone) : undefined,
    }

    await onsubmit?.(data)
  }
</script>

<form {...dataAttributes} class={formClass} onsubmit={handleSubmit}>
  <FormLayout {columns} {labelPosition} {labelWidth}>
    <!-- 标题 -->
    {#if showTitle}
      <h2 class='text-2xl font-semibold text-center mb-4'>{uiM('forgot_password_title')}</h2>
    {/if}

    <!-- 描述 -->
    {#if showDescription}
      <p class='text-center text-base-content/60 text-sm mb-6'>
        {uiM('forgot_password_desc')}
      </p>
    {/if}

    <!-- 自定义头部 -->
    {#if header}
      <div class='forgot-password-form-header'>
        {@render header()}
      </div>
    {/if}

    <!-- 邮箱输入 -->
    {#if mode === 'email'}
      <FormField for='forgot-email' label={uiM('forgot_password_email_label')}>
        <Input
          id='forgot-email'
          name='email'
          type='email'
          placeholder={uiM('forgot_password_email_placeholder')}
          bind:value={email}
          {disabled}
          required
          error={errors.email}
        />
      </FormField>
    {:else}
      <FormField for='forgot-phone' label={uiM('forgot_password_phone_label')}>
        <Input
          id='forgot-phone'
          name='phone'
          type='tel'
          placeholder={uiM('forgot_password_phone_placeholder')}
          bind:value={phone}
          {disabled}
          required
          error={errors.phone}
        />
      </FormField>
    {/if}

    <!-- 提示信息 -->
    <p class='text-sm text-base-content/60'>
      {#if mode === 'email'}
        {uiM('forgot_password_email_hint')}
      {:else}
        {uiM('forgot_password_phone_hint')}
      {/if}
    </p>

    <!-- 通用错误 -->
    {#if errors.general}
      <Alert variant='error'>
        {errors.general}
      </Alert>
    {/if}

    <!-- 提交按钮 -->
    <Button
      type='submit'
      variant='primary'
      {loading}
      disabled={loading || disabled}
      class='disabled:text-base-content/70 w-full'
    >
      {submitText || uiM('forgot_password_submit')}
    </Button>

    <!-- 自定义底部 -->
    {#if footer}
      <div class='forgot-password-form-footer'>
        {@render footer()}
      </div>
    {:else if showBackLink}
      <div class='text-center mt-4 text-sm'>
        <a href={loginUrl} class='link link-primary'>← {uiM('forgot_password_back')}</a>
      </div>
    {/if}
  </FormLayout>
</form>
