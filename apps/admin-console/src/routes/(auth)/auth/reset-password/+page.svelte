<!--
  =============================================================================
  Admin Console - 重置密码页面
  =============================================================================
  使用 @h-ai/ui 的 ResetPasswordForm 场景组件
  =============================================================================
-->
<script lang='ts'>
  import type { ResetPasswordFormData } from '@h-ai/ui'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import * as m from '$lib/paraglide/messages'
  import { authActions as actions } from '$lib/services/auth'
  import { authErrorMessage } from '@h-ai/ui/i18n'

  let loading = $state(false)
  let errors = $state<Record<string, string>>({})
  let success = $state(false)
  const loginPath = resolve('/auth/login', {})

  // 从 URL 获取 token
  const token = $derived(page.url.searchParams.get('token') ?? '')

  // 从 layout server data 读取 IAM 配置
  const passwordMinLength = $derived(page.data.iamPublicConfig.password.minLength)

  async function handleResetPassword(data: ResetPasswordFormData) {
    errors = {}

    const resetToken = token || data.code
    if (!resetToken) {
      errors = { general: m.auth_reset_invalid_link() }
      return
    }

    loading = true

    try {
      const result = await actions.confirmPasswordReset(resetToken, data.newPassword)

      if (result.success) {
        success = true
      }
      else {
        errors = { general: authErrorMessage(result.error) }
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
  <title>{m.auth_reset_password_title()} - {m.app_title()}</title>
</svelte:head>

{#if success}
  <Result
    status='success'
    title={m.auth_reset_success_title()}
    description={m.auth_reset_success_desc()}
  >
    {#snippet actions()}
      <a href={loginPath} class='btn btn-primary'>{m.auth_reset_login_now()}</a>
    {/snippet}
  </Result>
{:else}
  <ResetPasswordForm
    passwordPolicy={page.data.iamPublicConfig.password}
    {loading}
    {errors}
    showTitle
    showDescription
    showBackLink
    showCode={!token}
    showPasswordStrength={true}
    minPasswordLength={passwordMinLength}
    loginUrl={loginPath}
    onsubmit={handleResetPassword}
  />
{/if}
