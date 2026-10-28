<!--
  @component LoginForm
  用户登录表单组件，搭配 primitives/compounds 使用。

  @example
  ```ts
  import { mount, unmount } from 'svelte'
  import type { ComponentProps } from 'svelte'
  import { LoginForm } from '@h-ai/ui'
  const props: ComponentProps<typeof LoginForm> = { methods: ['password'] }
  const component = mount(LoginForm, { target: document.body, props })
  await unmount(component)
  ```
-->
<script lang='ts'>
  import type { HaiError } from '@h-ai/core'
  import type { DataAttributes } from '../../../types.js'
  import type { AuthLoginMethod, LoginFormData, LoginFormProps } from '../types.js'
  import { untrack } from 'svelte'
  import { uiM } from '../../../messages.js'
  import { useToastFeedback } from '../../../toast.svelte.js'
  import { cn, getDataAttributes } from '../../../utils.js'
  import FormField from '../../compounds/FormField.svelte'
  import FormLayout from '../../compounds/FormLayout.svelte'
  import BareButton from '../../primitives/BareButton.svelte'
  import Button from '../../primitives/Button.svelte'
  import Input from '../../primitives/Input.svelte'
  import AgreementNotice from './AgreementNotice.svelte'
  import { authErrorMessage } from './auth-error-message.js'
  import PasswordInput from './PasswordInput.svelte'

  const {
    methods = ['password'],
    autoFocus = true,
    initialIdentifier = '',
    otpLength = 6,
    resendInterval = 60,
    onsendotp,
    loading = false,
    columns = 1,
    labelPosition = 'top',
    labelWidth = '8rem',
    disabled = false,
    showTitle = false,
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
    extraFields,
    footer,
    ...restProps
  }: LoginFormProps & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
  let formElement = $state<HTMLFormElement>()
  let focusedInitially = false

  let username = $state(untrack(() => initialIdentifier))
  let password = $state('')
  let selectedMethod = $state<AuthLoginMethod>('password')
  const method = $derived(methods.includes(selectedMethod) ? selectedMethod : methods[0])
  useToastFeedback(() => !method ? uiM('auth_unavailable') : '', 'warning')
  const isOtp = $derived(method === 'email' || method === 'sms')
  $effect(() => {
    if (!autoFocus || focusedInitially || disabled || loading || !method || !formElement)
      return
    const input = formElement.querySelector<HTMLInputElement>('input[autocomplete="username"]')
    if (!input?.getClientRects().length)
      return
    if (globalThis.matchMedia?.('(pointer: coarse)').matches) {
      focusedInitially = true
      return
    }
    input.autofocus = true
    // 首帧布局和宿主导航完成后设置默认焦点；尊重用户已经选择的其它控件。
    const frame = requestAnimationFrame(() => {
      focusedInitially = true
      if (document.activeElement === document.body || document.activeElement === document.documentElement)
        input.focus()
    })
    return () => cancelAnimationFrame(frame)
  })
  let code = $state('')
  let sending = $state(false)
  let sendFailure = $state<Pick<HaiError, 'code' | 'message' | 'traceId' | 'httpStatus'> | 'network'>()
  const sendError = $derived(sendFailure === 'network' ? uiM('auth_network_error') : sendFailure ? authErrorMessage(sendFailure) : '')
  let resendAt = $state(0)
  let now = $state(Date.now())
  const remaining = $derived(Math.max(0, Math.ceil((resendAt - now) / 1000)))
  // 倒计时只负责 UI 提示；服务端独立校验 resendInterval，刷新页面不能绕过限制。
  $effect(() => {
    if (resendAt <= Date.now())
      return
    const timer = setInterval(() => {
      now = Date.now()
    }, 1000)
    return () => clearInterval(timer)
  })

  function methodLabel(value: AuthLoginMethod): string {
    if (value === 'ldap')
      return uiM('login_method_ldap')
    if (value === 'email')
      return uiM('login_method_email')
    if (value === 'sms')
      return uiM('login_method_sms')
    return uiM('login_method_password')
  }

  async function sendOtp() {
    if (!onsendotp || sending || remaining || !username.trim())
      return
    sending = true
    sendFailure = undefined
    try {
      const result = await onsendotp(username.trim())
      if (!result.success) {
        sendFailure = result.error
      }
      else {
        now = Date.now()
        resendAt = now + resendInterval * 1000
      }
    }
    catch {
      sendFailure = 'network'
    }
    finally { sending = false }
  }

  const formClass = $derived(
    cn(
      'login-form space-y-4',
      className,
    ),
  )

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (loading || disabled || !method)
      return

    const data: LoginFormData = {
      username,
      password,
      method,
      code: isOtp ? code : undefined,
    }

    await onsubmit?.(data)
  }

  function handleForgotPassword() {
    onforgotpassword?.()
  }
  useToastFeedback(() => sendError)
  useToastFeedback(() => errors.general)
</script>

<form {...dataAttributes} bind:this={formElement} class={formClass} onsubmit={handleSubmit}>
  <FormLayout {columns} {labelPosition} {labelWidth}>
    <!-- 标题 -->
    {#if showTitle}
      <h2 class='text-xl font-semibold text-center mb-5'>{uiM('login_title')}</h2>
    {/if}

    <!-- 自定义头部 -->
    {#if header}
      <div class='login-form-header'>
        {@render header()}
      </div>
    {/if}

    <!-- 用户名 -->
    {#if methods.length > 1}
      <div class='grid grid-cols-2 gap-1 rounded-lg bg-base-200 p-1 sm:flex' aria-label={uiM('login_methods')}>
        {#each methods as value (value)}
          <button type='button' class={cn('flex-1 rounded-md px-2 py-2 text-sm transition-colors', method === value ? 'bg-base-100 font-medium shadow-sm' : 'text-base-content/60')} aria-pressed={method === value} disabled={loading || disabled} onclick={() => {
            selectedMethod = value
            password = ''
            code = ''
            sendFailure = undefined
          }}>
            {methodLabel(value)}
          </button>
        {/each}
      </div>
    {/if}
    {#if method === 'ldap'}<p class='text-sm text-base-content/70'>{uiM('login_method_ldap_hint')}</p>{/if}
    {#if method}
      <FormField for='login-username' label={method === 'email' ? uiM('register_email') : method === 'sms' ? uiM('register_phone') : uiM('login_username')}>
        <Input
          id='login-username'
          name='username'
          type={method === 'email' ? 'email' : method === 'sms' ? 'tel' : 'text'}
          placeholder={method === 'email' ? uiM('register_email_placeholder') : method === 'sms' ? uiM('register_phone_placeholder') : uiM('login_username_placeholder')}
          bind:value={username}
          autocomplete='username'
          {disabled}
          required
          error={errors.username}
        />
      </FormField>

      <!-- 密码 -->
      {#if isOtp}
        <FormField for='login-code' label={uiM('login_code')}>
          <div class='flex items-start gap-2'>
            <Input id='login-code' name='code' bind:value={code} autocomplete='one-time-code' inputmode='numeric' maxlength={otpLength} pattern={`[0-9]{${otpLength}}`} placeholder={uiM('login_code_placeholder', { length: otpLength })} required {disabled} />
            <Button type='button' variant='outline' loading={sending} disabled={loading || disabled || !username.trim() || remaining > 0 || !onsendotp} onclick={sendOtp}>
              {remaining ? uiM('login_resend_wait', { seconds: remaining }) : uiM('login_send_code')}
            </Button>
          </div>
        </FormField>
      {:else}
        <FormField for='login-password' label={uiM('login_password')}>
          <PasswordInput
            id='login-password'
            bind:value={password}
            placeholder={uiM('login_password_placeholder')}
            autocomplete='current-password'
            {disabled}
            required
            error={errors.password}
            showStrength={false}
          />
        </FormField>
      {/if}
    {/if}

    <!-- 忘记密码 -->
    {#if method === 'password' && showForgotPassword}
      <div class='flex justify-end'>
        {#if onforgotpassword}
          <BareButton
            type='button'
            class='link link-primary text-sm'
            onclick={handleForgotPassword}
          >
            {uiM('login_forgot_password')}
          </BareButton>
        {:else}
          <a href={forgotPasswordUrl} class='link link-primary text-sm'>
            {uiM('login_forgot_password')}
          </a>
        {/if}
      </div>
    {/if}

    <!-- 通用错误 -->
    {#if extraFields}
      <div class='login-form-extra-fields'>{@render extraFields()}</div>
    {/if}

    <!-- 提交按钮 -->
    <Button
      type='submit'
      submitHint
      variant='primary'
      {loading}
      disabled={loading || disabled || !method}
      class='disabled:text-base-content/70 w-full'
    >
      {submitText || uiM('login_submit')}
    </Button>

    <!-- 协议提示 -->
    <AgreementNotice {agreements} />

    <!-- 自定义底部 -->
    {#if footer}
      <div class='login-form-footer'>
        {@render footer()}
      </div>
    {:else if showRegisterLink}
      <div class='text-center mt-4 text-sm text-base-content/60'>
        <span>{uiM('login_no_account')}</span>
        <a href={registerUrl} class='link link-primary ml-1'>{uiM('login_register_now')}</a>
      </div>
    {/if}
  </FormLayout>
</form>
