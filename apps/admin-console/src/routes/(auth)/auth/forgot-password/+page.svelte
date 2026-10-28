<!--
  =============================================================================
  Admin Console - 忘记密码页面
  =============================================================================
  使用 @h-ai/ui 的 ForgotPasswordForm 场景组件
  =============================================================================
-->
<script lang='ts'>
  import type { ForgotPasswordFormData } from '@h-ai/ui'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import * as m from '$lib/paraglide/messages'
  import { authActions as actions } from '$lib/services/auth'
  import { authErrorMessage } from '@h-ai/ui/i18n'

  let loading = $state(false)
  let errors = $state<Record<string, string>>({})
  let success = $state(false)
  const loginPath = resolve('/auth/login', {})
  const resetPath = resolve('/auth/reset-password', {})

  async function handleForgotPassword(data: ForgotPasswordFormData) {
    errors = {}
    loading = true

    try {
      const result = await actions.requestPasswordReset(data.email || data.phone || '')

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
  <title>{m.auth_forgot_password_title()} - {m.app_title()}</title>
</svelte:head>

{#if success}
  <Result
    status='success'
    title={m.auth_forgot_email_sent_title()}
    description={m.auth_forgot_email_sent_desc()}
  >
    {#snippet actions()}
      <a href={resetPath} class='btn btn-primary'>{m.auth_reset_password_title()}</a>
      <a href={loginPath} class='btn btn-outline'>{m.auth_back_to_login()}</a>
    {/snippet}
  </Result>
{:else}
  <ForgotPasswordForm
    {loading}
    {errors}
    showTitle
    showDescription
    showBackLink
    mode={page.data.iamPublicConfig.passwordReset.mode}
    loginUrl={loginPath}
    onsubmit={handleForgotPassword}
  />
{/if}
