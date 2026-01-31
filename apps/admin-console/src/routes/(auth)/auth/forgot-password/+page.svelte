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
        errors = { general: result.error || m.auth_forgot_password_error() }
      }
    } catch {
      errors = { general: m.common_network_error() }
    } finally {
      loading = false
    }
  }
</script>

<svelte:head>
  <title>{m.auth_forgot_password_title()} - Admin Console</title>
</svelte:head>

<h2 class="text-2xl font-semibold text-center mb-4">{m.auth_forgot_password_title()}</h2>

{#if success}
  <Result
    status="success"
    title={m.auth_forgot_password_success_title()}
    description={m.auth_forgot_password_success_desc()}
  >
    {#snippet actions()}
      <a href="/auth/login" class="btn btn-primary">{m.auth_forgot_password_back()}</a>
    {/snippet}
  </Result>
{:else}
  <p class="text-center text-base-content/60 text-sm mb-6">
    {m.auth_forgot_password_desc()}
  </p>

  <ForgotPasswordForm
    {loading}
    {errors}
    mode="email"
    labels={{
      email: m.auth_email(),
    }}
    placeholders={{
      email: m.auth_email(),
    }}
    submitText={m.auth_forgot_password_submit()}
    validationMessages={{
      required: m.validation_required(),
      email: m.validation_email(),
    }}
    onsubmit={handleForgotPassword}
  >
    {#snippet footer()}
      <div class="text-center mt-4 text-sm">
        <a href="/auth/login" class="link link-primary">← {m.auth_forgot_password_back()}</a>
      </div>
    {/snippet}
  </ForgotPasswordForm>
{/if}
