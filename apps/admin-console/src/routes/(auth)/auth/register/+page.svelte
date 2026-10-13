<!--
  =============================================================================
  Admin Console - 注册页面
  =============================================================================
  使用 @h-ai/ui 的 RegisterForm 场景组件
  =============================================================================
-->
<script lang='ts'>
  import type { RegisterFormData } from '@h-ai/ui'
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import * as m from '$lib/paraglide/messages'
  import { authActions as actions } from '$lib/services/auth'

  let loading = $state(false)
  let errors = $state<Record<string, string>>({})
  const adminHomePath = resolve('/admin', {})
  const loginPath = resolve('/auth/login', {})

  // 从 layout server data 读取 IAM 配置
  const iamPublicConfig = $derived(page.data.iamPublicConfig)
  const passwordMinLength = $derived(iamPublicConfig?.password?.minLength ?? 8)
  const registerAgreements = $derived(
    iamPublicConfig?.agreements?.showOnRegister !== false
      ? iamPublicConfig.agreements
      : undefined,
  )

  async function handleRegister(data: RegisterFormData) {
    errors = {}
    loading = true

    const username = data.username?.trim() ?? ''
    const email = data.email?.trim() || undefined

    try {
      const result = await actions.register({ username, email, phone: data.phone?.trim() || undefined, password: data.password })

      if (result.success) {
        await goto(adminHomePath)
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
  <title>{m.auth_register_title()} - {m.app_title()}</title>
</svelte:head>

<RegisterForm
  {loading}
  {errors}
  showTitle
  showLoginLink
  fields={iamPublicConfig.passwordReset.mode === 'phone' ? ['username', 'phone', 'password'] : ['username', 'email', 'password']}
  requireConfirmPassword={true}
  showPasswordStrength={true}
  minPasswordLength={passwordMinLength}
  passwordPolicy={iamPublicConfig.password}
  loginUrl={loginPath}
  agreements={registerAgreements}
  onsubmit={handleRegister}
/>
