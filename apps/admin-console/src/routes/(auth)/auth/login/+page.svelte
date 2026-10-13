<!--
  =============================================================================
  Admin Console - 登录页面
  =============================================================================
  使用 @h-ai/ui 的 LoginForm 场景组件
  =============================================================================
-->
<script lang='ts'>
  import type { LoginFormData } from '@h-ai/ui'
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import * as m from '$lib/paraglide/messages'
  import { authActions as actions } from '$lib/services/auth'

  const methods = $derived((['password', 'ldap', 'email', 'sms'] as const).filter(method => page.data.iamPublicConfig.login[method]))

  let loading = $state(false)
  let errors = $state<Record<string, string>>({})
  const forgotPasswordPath = resolve('/auth/forgot-password', {})
  const registerPath = resolve('/auth/register', {})

  const iamPublicConfig = $derived(page.data.iamPublicConfig)
  const showRegisterLink = $derived(iamPublicConfig?.register?.enabled ?? true)
  const returnUrl = $derived(page.url.searchParams.get('returnUrl') ?? '')
  const loginAgreements = $derived(
    iamPublicConfig?.agreements?.showOnLogin
      ? iamPublicConfig.agreements
      : undefined,
  )

  /**
   * 规范化登录后的跳转地址。
   * 仅允许站内受保护路径，避免开放重定向风险。
   */
  function resolveRedirectTarget(url: string) {
    if (!url) {
      return '/admin'
    }

    if (!url.startsWith('/') || url.startsWith('//')) {
      return '/admin'
    }

    if (!url.startsWith('/admin')) {
      return '/admin'
    }

    return url
  }

  async function handleLogin(data: LoginFormData) {
    errors = {}
    loading = true

    try {
      const result = await actions.login({ identifier: data.username, password: data.password, method: data.method, code: data.code })

      if (result.success) {
        const redirectTarget = resolve(resolveRedirectTarget(returnUrl), {})
        await goto(redirectTarget)
      }
      else {
        errors = { general: result.error?.message || m.common_error() }
      }
    }
    catch {
      errors = { general: m.common_network_error() }
    }
    finally {
      loading = false
    }
  }
</script>

<svelte:head>
  <title>{m.auth_login_title()} - {m.app_title()}</title>
</svelte:head>

<LoginForm
  {loading}
  {errors}
  {methods}
  showRememberMe={false}
  showForgotPassword={iamPublicConfig.passwordReset.enabled}
  otpLength={iamPublicConfig.otp.length}
  resendInterval={iamPublicConfig.otp.resendInterval}
  onsendotp={actions.sendOtp}
  showTitle
  showRegisterLink={showRegisterLink}
  forgotPasswordUrl={forgotPasswordPath}
  registerUrl={registerPath}
  agreements={loginAgreements}
  onsubmit={handleLogin}
/>
