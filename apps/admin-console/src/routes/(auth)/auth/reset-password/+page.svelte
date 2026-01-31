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
      errors = { general: m.auth_reset_password_invalid_link() }
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
        errors = { general: result.error || m.auth_reset_password_error() }
      }
    } catch {
      errors = { general: m.common_network_error() }
    } finally {
      loading = false
    }
  }
</script>

<svelte:head>
  <title>{m.auth_reset_password_title()} - Admin Console</title>
</svelte:head>

<h2 class="text-2xl font-semibold text-center mb-4">{m.auth_reset_password_title()}</h2>

{#if success}
  <Result
    status="success"
    title={m.auth_reset_password_success_title()}
    description={m.auth_reset_password_success_desc()}
  >
    {#snippet actions()}
      <a href="/auth/login" class="btn btn-primary">{m.auth_reset_password_login()}</a>
    {/snippet}
  </Result>
{:else if !token}
  <Result
    status="warning"
    title={m.auth_reset_password_invalid_title()}
    description={m.auth_reset_password_invalid_desc()}
  >
    {#snippet actions()}
      <a href="/auth/forgot-password" class="btn btn-primary">{m.auth_reset_password_reapply()}</a>
    {/snippet}
  </Result>
{:else}
  <p class="text-center text-base-content/60 text-sm mb-6">
    {m.auth_reset_password_desc()}
  </p>

  <ResetPasswordForm
    {loading}
    {errors}
    showCode={false}
    showPasswordStrength={true}
    minPasswordLength={8}
    labels={{
      newPasswordLabel: m.auth_reset_password_new(),
      newPasswordPlaceholder: m.auth_reset_password_new_placeholder(),
      confirmPasswordLabel: m.auth_reset_password_confirm(),
      confirmPasswordPlaceholder: m.auth_reset_password_confirm_placeholder(),
    }}
    strengthLabels={{
      weak: m.auth_password_weak(),
      medium: m.auth_password_medium(),
      strong: m.auth_password_strong(),
      veryStrong: m.auth_password_very_strong(),
      label: m.auth_password_strength(),
    }}
    toggleLabels={{
      showPassword: m.auth_show_password(),
      hidePassword: m.auth_hide_password(),
    }}
    validationMessages={{
      required: m.validation_required(),
      passwordMismatch: m.auth_password_mismatch(),
    }}
    submitText={m.auth_reset_password_submit()}
    onsubmit={handleResetPassword}
  />

  <div class="text-center mt-4 text-sm">
    <a href="/auth/login" class="link link-primary">← {m.auth_forgot_password_back()}</a>
  </div>
{/if}
