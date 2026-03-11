<!--
  =============================================================================
  Admin Console - 注册页面
  =============================================================================
  使用 @h-ai/ui 的 RegisterForm 场景组件
  =============================================================================
-->
<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import type { RegisterFormData } from '@h-ai/ui'
  import * as m from '$lib/paraglide/messages'
  import { apiFetch } from '$lib/utils/api'
  import { kit } from '@h-ai/kit'
  
  let loading = $state(false)
  let errors = $state<Record<string, string>>({})

  // 从 layout server data 读取 IAM 配置
  const iamPublicConfig = $derived(page.data.iamPublicConfig as { password?: { minLength?: number }, agreements?: { showOnRegister?: boolean, userAgreementUrl?: string, privacyPolicyUrl?: string } } | undefined)
  const passwordMinLength = $derived(iamPublicConfig?.password?.minLength ?? 8)
  const registerAgreements = $derived(
    iamPublicConfig?.agreements?.showOnRegister !== false
      ? {
          userAgreementUrl: iamPublicConfig?.agreements?.userAgreementUrl,
          privacyPolicyUrl: iamPublicConfig?.agreements?.privacyPolicyUrl,
        }
      : undefined
  )

  async function handleRegister(data: RegisterFormData) {
    errors = {}
    loading = true

    try {
      const response = await apiFetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: data.username,
          email: data.email,
          password: data.password,
          confirmPassword: data.confirmPassword ?? data.password,
        }),
      })

      const result = await response.json()

      if (result.success) {
        if (result.data?.accessToken) {
          kit.auth.setBrowserAccessToken(result.data.accessToken)
        }
        goto('/admin')
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
  <title>{m.auth_register_title()} - {m.app_title()}</title>
</svelte:head>

<RegisterForm
  {loading}
  {errors}
  showTitle
  showLoginLink
  fields={['username', 'email', 'password']}
  requireConfirmPassword={true}
  showPasswordStrength={true}
  minPasswordLength={passwordMinLength}
  loginUrl="/auth/login"
  agreements={registerAgreements}
  onsubmit={handleRegister}
/>
