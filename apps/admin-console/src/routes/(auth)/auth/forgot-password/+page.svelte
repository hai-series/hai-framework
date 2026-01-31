<!--
  =============================================================================
  Admin Console - 忘记密码页面
  =============================================================================
  使用 @hai/ui 的 ForgotPasswordForm 场景组件
  =============================================================================
-->
<script lang="ts">
  import { ForgotPasswordForm, type ForgotPasswordFormData, Result } from '@hai/ui'
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
  <title>Forgot Password - Admin Console</title>
</svelte:head>

{#if success}
  <Result
    status="success"
    title="Email Sent"
    description="If this email is registered, you will receive a password reset email. Please check your inbox."
  >
    {#snippet actions()}
      <a href="/auth/login" class="btn btn-primary">Back to Login</a>
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
