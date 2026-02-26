<!--
  =============================================================================
  Admin Console - 忘记密码页面
  =============================================================================
  使用 @h-ai/ui 的 ForgotPasswordForm 场景组件
  =============================================================================
-->
<script lang="ts">
  import type { ForgotPasswordFormData } from '@h-ai/ui'
  import * as m from '$lib/paraglide/messages'
  
  let loading = $state(false)
  let errors = $state<Record<string, string>>({})
  let success = $state(false)

  async function handleForgotPassword(data: ForgotPasswordFormData) {
    errors = {}
    loading = true

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: data.email }),
      })

      const result = await response.json()

      if (result.success) {
        success = true
      } else {
        errors = { general: result.error || m.common_error() }
      }
    } catch {
      errors = { general: m.common_network_error() }
    } finally {
      loading = false
    }
  }
</script>

<svelte:head>
  <title>{m.auth_forgot_password_title()} - {m.app_title()}</title>
</svelte:head>

{#if success}
  <Result
    status="success"
    title={m.auth_forgot_email_sent_title()}
    description={m.auth_forgot_email_sent_desc()}
  >
    {#snippet actions()}
      <a href="/auth/login" class="btn btn-primary">{m.auth_back_to_login()}</a>
    {/snippet}
  </Result>
{:else}
  <ForgotPasswordForm
    {loading}
    {errors}
    showTitle
    showDescription
    showBackLink
    mode="email"
    loginUrl="/auth/login"
    onsubmit={handleForgotPassword}
  />
{/if}
