<!--
  =============================================================================
  Admin Console - 登录页面
  =============================================================================
  使用 @h-ai/ui 的 LoginForm 场景组件
  =============================================================================
-->
<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import type { LoginFormData } from '@h-ai/ui'
  import * as m from '$lib/paraglide/messages'
  import { apiFetch } from '$lib/utils/api'
  import { kit } from '@h-ai/kit'
  
  let loading = $state(false)
  let errors = $state<Record<string, string>>({})

  const iamPublicConfig = $derived(page.data.iamPublicConfig)
  const showRegisterLink = $derived(iamPublicConfig?.register?.enabled ?? true)
  const returnUrl = $derived(page.url.searchParams.get('returnUrl') ?? '')
  const loginAgreements = $derived(
    iamPublicConfig?.agreements?.showOnLogin
      ? {
          userAgreementUrl: iamPublicConfig.agreements.userAgreementUrl,
          privacyPolicyUrl: iamPublicConfig.agreements.privacyPolicyUrl,
        }
      : undefined
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
      const response = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          identifier: data.username, 
          password: data.password 
        }),
      })

      const result = await response.json()

      if (result.success) {
        if (result.data?.accessToken) {
          kit.auth.setBrowserToken(result.data.accessToken)
        }
        goto(resolveRedirectTarget(returnUrl))
      } else {
        errors = { general: result.error?.message || m.common_error() }
      }
    } catch {
      errors = { general: m.common_network_error() }
    } finally {
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
  showTitle
  showRegisterLink={showRegisterLink}
  forgotPasswordUrl="/auth/forgot-password"
  registerUrl="/auth/register"
  agreements={loginAgreements}
  onsubmit={handleLogin}
/>
