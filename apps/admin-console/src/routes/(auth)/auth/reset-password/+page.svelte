<!--
  =============================================================================
  Admin Console - 重置密码页面
  =============================================================================
  使用 @h-ai/ui 的 ResetPasswordForm 场景组件
  =============================================================================
-->
<script lang="ts">
  import { page } from '$app/state'
  import { goto } from '$app/navigation'
  import type { ResetPasswordFormData } from '@h-ai/ui'
  import * as m from '$lib/paraglide/messages'
  
  let loading = $state(false)
  let errors = $state<Record<string, string>>({})
  let success = $state(false)

  // 从 URL 获取 token
  const token = $derived(page.url.searchParams.get('token') ?? '')

  async function handleResetPassword(data: ResetPasswordFormData) {
    errors = {}

    if (!token) {
      errors = { general: m.auth_reset_invalid_link() }
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
        errors = { general: result.error || m.auth_reset_failed() }
      }
    } catch {
      errors = { general: m.common_network_error() }
    } finally {
      loading = false
    }
  }
</script>

<svelte:head>
  <title>{m.auth_reset_password_title()} - {m.app_title()}</title>
</svelte:head>

{#if success}
  <Result
    status="success"
    title={m.auth_reset_success_title()}
    description={m.auth_reset_success_desc()}
  >
    {#snippet actions()}
      <a href="/auth/login" class="btn btn-primary">{m.auth_reset_login_now()}</a>
    {/snippet}
  </Result>
{:else if !token}
  <Result
    status="warning"
    title={m.auth_reset_invalid_link_title()}
    description={m.auth_reset_invalid_link_desc()}
  >
    {#snippet actions()}
      <a href="/auth/forgot-password" class="btn btn-primary">{m.auth_reset_request_again()}</a>
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
