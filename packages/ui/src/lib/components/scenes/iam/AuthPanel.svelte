<!--
  @component AuthPanel 配置驱动认证场景；网络、通知及 Token 存储由 actions 注入。

  @example
  ```ts
  import { mount, unmount } from 'svelte'
  import { AuthPanel } from '@h-ai/ui'
  import { apiClient } from '@h-ai/api-client'
  import type { AuthPanelProps } from '@h-ai/ui'
  const initialized = await apiClient.init({ baseUrl: 'https://api.example.com/api/v1' })
  if (!initialized.success) throw new Error(initialized.error.message)
  try {
    const result = await apiClient.iam.auth.publicConfig()
    if (!result.success) throw new Error(result.error.message)
    if (!result.data) throw new Error('Public auth configuration unavailable')
    const actions = apiClient.createAuthActions(apiClient)
    const props: AuthPanelProps = { config: result.data, actions, initialMode: 'login' }
    const panel = mount(AuthPanel, { target: document.body, props })
    await unmount(panel)
  }
  finally {
    await apiClient.close()
  }
  ```
-->
<script lang='ts'>
  import type { HaiError, HaiResult } from '@h-ai/core'
  import type { UIMessageKey } from '../../../messages.js'
  import type { AuthLoginMethod, AuthPanelMode, AuthPanelProps } from '../types.js'
  import { onMount, untrack } from 'svelte'
  import { uiM } from '../../../messages.js'
  import { getDataAttributes } from '../../../utils.js'
  import Alert from '../../compounds/Alert.svelte'
  import BareButton from '../../primitives/BareButton.svelte'
  import Button from '../../primitives/Button.svelte'
  import Spinner from '../../primitives/Spinner.svelte'
  import { authErrorMessage } from './auth-error-message.js'
  import AuthShell from './AuthShell.svelte'
  import ForgotPasswordForm from './ForgotPasswordForm.svelte'
  import LoginForm from './LoginForm.svelte'
  import RegisterForm from './RegisterForm.svelte'
  import ResetPasswordForm from './ResetPasswordForm.svelte'

  const { config, actions, columns = 1, labelPosition = 'top', labelWidth = '8rem', initialMode = 'login', resetToken = '', loginUrl, registerUrl, forgotPasswordUrl, onauthenticated, error = '', onretry, loginHeader, loginFields, loginFooter, registerHeader, registerFields, registerFooter, ...restProps }: AuthPanelProps = $props()
  const dataAttributes = $derived(getDataAttributes(restProps))
  let mode = $state<AuthPanelMode>(untrack(() => initialMode))
  let loading = $state(false)
  let actionError = $state<Pick<HaiError, 'code' | 'message'>>()
  let networkFailed = $state(false)
  const errors = $derived<Record<string, string>>(actionError ? { general: authErrorMessage(actionError) } : networkFailed ? { general: uiM('auth_network_error') } : {})
  let notice = $state<UIMessageKey | ''>('')
  // SSR 表单先显示但不可编辑；客户端绑定事件后开放输入，避免接管时丢失早到的输入。
  let interactive = $state(false)
  onMount(() => {
    interactive = true
  })
  const methods = $derived(config ? (['password', 'ldap', 'email', 'sms'] as AuthLoginMethod[]).filter(method => config.login[method]) : [])
  const title = $derived(mode === 'register' ? uiM('register_title') : mode === 'forgot' ? uiM('forgot_password_title') : mode === 'reset' ? uiM('reset_password_title') : uiM('login_title'))
  const available = $derived(config && (mode === 'login' || (mode === 'register' ? config.register.enabled : config.passwordReset.enabled)))

  function switchMode(next: AuthPanelMode) {
    mode = next
    actionError = undefined
    networkFailed = false
    notice = ''
  }
  async function run(operation: () => Promise<HaiResult<unknown>>, authenticate = false, successNotice: UIMessageKey | '' = '') {
    if (loading)
      return
    actionError = undefined
    networkFailed = false
    notice = ''
    loading = true
    try {
      const result = await operation()
      if (!result.success) {
        if (mode === 'register' && result.error.code === 'hai:iam:004') {
          // 默认禁用的新账户已完成注册，提示等待启用，避免用户重复注册。
          switchMode('login')
          notice = 'auth_registration_pending'
        }
        else {
          actionError = result.error
        }
      }
      else if (authenticate) {
        await onauthenticated?.()
      }
      else {
        notice = successNotice
      }
    }
    catch { networkFailed = true }
    finally { loading = false }
  }
</script>

{#snippet link(next: AuthPanelMode, label: string, href?: string)}
  {#if href}<a {href} class='link link-primary text-sm' aria-disabled={loading} onclick={(event) => {
    if (loading) {
      event.preventDefault()
      return
    }
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
      return
    // 当前完整 URL 只切换场景，阻止重复导航重建表单并清空刚输入的内容。
    // 跨路径、查询或 hash 的链接由路由接管；修改键点击保留浏览器的新窗口行为。
    if (event.currentTarget.href === window.location.href) {
      event.preventDefault()
      switchMode(next)
    }
  }}>{label}</a>
  {:else}<BareButton type='button' class='link link-primary text-sm' disabled={loading} onclick={() => switchMode(next)}>{label}</BareButton>{/if}
{/snippet}

<AuthShell {...dataAttributes} {...config?.ui} title={config?.ui.title || title} brandTitle={config?.ui.brandTitle || uiM('auth_brand')}>
  <fieldset class='m-0 min-w-0 border-0 p-0' disabled={!interactive}>
    <!-- 固定内容包装节点，避免 fieldset 插入通知时丢失容器查询子树的布局。 -->
    <div class='min-w-0'>
      {#if error}
        <Alert variant='error'>{error}</Alert>
        {#if onretry}<Button class='mt-4 w-full' onclick={onretry}>{uiM('crud_retry')}</Button>{/if}
      {:else if !config}
        <div class='flex justify-center' role='status'><Spinner /></div>
      {:else if !available}
        <Alert variant='warning'>{uiM('auth_unavailable')}</Alert>
        <div class='mt-4 text-center'>{@render link('login', uiM('login_submit'), loginUrl)}</div>
      {:else}
        {#if notice}<Alert variant='success' class='mb-4'>{uiM(notice)}</Alert>{/if}
        {#if mode === 'login'}
          <LoginForm {columns} {labelPosition} {labelWidth} {methods} {loading} {errors} header={loginHeader} extraFields={loginFields} showForgotPassword={config.passwordReset.enabled} {forgotPasswordUrl}
                     onforgotpassword={forgotPasswordUrl ? undefined : () => switchMode('forgot')}
                     otpLength={config.otp.length} resendInterval={config.otp.resendInterval} onsendotp={actions.sendOtp}
                     agreements={config.agreements.showOnLogin ? config.agreements : undefined}
                     onsubmit={data => run(() => actions.login({ identifier: data.username, password: data.password, method: data.method, code: data.code }), true)}>
            {#snippet footer()}
              {#if loginFooter}{@render loginFooter()}{/if}
              {#if config?.register.enabled}<div class='text-center text-sm'>{uiM('login_no_account')} {@render link('register', uiM('login_register_now'), registerUrl)}</div>{/if}
            {/snippet}
          </LoginForm>
        {:else if mode === 'register'}
          <RegisterForm {columns} {labelPosition} {labelWidth} {loading} {errors} header={registerHeader} extraFields={registerFields} fields={config.passwordReset.mode === 'phone' ? ['username', 'phone', 'password'] : ['username', 'email', 'password']} passwordPolicy={config.password} minPasswordLength={config.password.minLength}
                        agreements={config.agreements.showOnRegister ? config.agreements : undefined} onsubmit={data => run(() => actions.register({ username: data.username || '', password: data.password, email: data.email, phone: data.phone, displayName: data.nickname }), true)}>
            {#snippet footer()}
              {#if registerFooter}{@render registerFooter()}{/if}
              <div class='text-center'>{@render link('login', uiM('register_login_now'), loginUrl)}</div>
            {/snippet}
          </RegisterForm>
        {:else if mode === 'forgot'}
          <ForgotPasswordForm {columns} {labelPosition} {labelWidth} {loading} {errors} mode={config.passwordReset.mode ?? 'email'} onsubmit={data => run(() => actions.requestPasswordReset(data.email || data.phone || ''), false, 'auth_reset_sent')}>
            {#snippet footer()}<div class='flex justify-between gap-3'>{@render link('login', uiM('login_submit'), loginUrl)}{@render link('reset', uiM('auth_have_token'))}</div>{/snippet}
          </ForgotPasswordForm>
        {:else}
          <ResetPasswordForm {columns} {labelPosition} {labelWidth} {loading} {errors} showCode={!resetToken} passwordPolicy={config.password} minPasswordLength={config.password.minLength}
                             onsubmit={data => run(() => actions.confirmPasswordReset(resetToken || data.code || '', data.newPassword), false, 'auth_reset_done')} />
          <div class='mt-4 text-center'>{@render link('login', uiM('login_submit'), loginUrl)}</div>
        {/if}
      {/if}
    </div>
  </fieldset>
</AuthShell>
