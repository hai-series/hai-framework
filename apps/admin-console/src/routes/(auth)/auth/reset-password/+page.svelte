<!--
  =============================================================================
  Admin Console - 重置密码页面
  =============================================================================
  使用 @hai/ui 的 ResetPasswordForm 场景组件
  =============================================================================
-->
<script lang="ts">
  import { page } from '$app/stores'
  import { goto } from '$app/navigation'
  import { ResetPasswordForm, type ResetPasswordFormData, Result } from '@hai/ui'
  import * as m from '$lib/paraglide/messages'
  
  let loading = $state(false)
  let errors = $state<Record<string, string>>({})
  let success = $state(false)

  // 从 URL 获取 token
  const token = $derived($page.url.searchParams.get('token') ?? '')

  async function handleResetPassword(data: ResetPasswordFormData) {
    errors = {}

    if (!token) {
      errors = { general: 'Invalid reset link' }
      return
    }

    loading = true

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          token, 
          password: data.newPassword, 
          confirmPassword: data.confirmPassword 
        }),
      })

      const result = await response.json()

      if (result.success) {
        success = true
        // 3秒后跳转到登录页
        setTimeout(() => goto('/auth/login'), 3000)
      } else {
        errors = { general: result.error || 'Reset failed' }
      }
    } catch {
      errors = { general: m.common_network_error() }
    } finally {
      loading = false
    }
  }
</script>

<svelte:head>
  <title>Reset Password - Admin Console</title>
</svelte:head>

{#if success}
  <Result
    status="success"
    title="Password Reset Successful"
    description="Your password has been reset. Redirecting to login page..."
  >
    {#snippet actions()}
      <a href="/auth/login" class="btn btn-primary">Login Now</a>
    {/snippet}
  </Result>
{:else if !token}
  <Result
    status="warning"
    title="Invalid Link"
    description="The reset link is invalid or has expired. Please request a new one."
  >
    {#snippet actions()}
      <a href="/auth/forgot-password" class="btn btn-primary">Request Again</a>
    {/snippet}
  </Result>
{:else}
  <ResetPasswordForm
    {loading}
    {errors}
    showTitle
    showDescription
    showBackLink
    showCode={false}
    showPasswordStrength={true}
    minPasswordLength={8}
    loginUrl="/auth/login"
    onsubmit={handleResetPassword}
  />
{/if}
