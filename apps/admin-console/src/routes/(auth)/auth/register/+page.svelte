<!--
  =============================================================================
  Admin Console - 注册页面
  =============================================================================
  使用 @hai/ui 的 RegisterForm 场景组件
  =============================================================================
-->
<script lang="ts">
  import { goto } from '$app/navigation'
  import { RegisterForm, type RegisterFormData } from '@hai/ui'
  import * as m from '$lib/paraglide/messages'
  
  let loading = $state(false)
  let errors = $state<Record<string, string>>({})

  async function handleRegister(data: RegisterFormData) {
    errors = {}
    loading = true

    try {
      const response = await fetch('/api/auth/register', {
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
        goto('/admin')
      } else {
        errors = { general: result.error || m.auth_register_failed() }
      }
    } catch {
      errors = { general: m.common_network_error() }
    } finally {
      loading = false
    }
  }
</script>

<svelte:head>
  <title>{m.auth_register()} - Admin Console</title>
</svelte:head>

<h2 class="text-2xl font-semibold text-center mb-6">{m.auth_create_account()}</h2>

<RegisterForm
  {loading}
  {errors}
  fields={['username', 'email', 'password']}
  requireConfirmPassword={true}
  showPasswordStrength={true}
  minPasswordLength={8}
  submitText={m.auth_register()}
  labels={{
    username: m.auth_username(),
    email: m.auth_email(),
    password: m.auth_password(),
    confirmPassword: m.auth_confirm_password(),
  }}
  placeholders={{
    username: m.auth_username_placeholder(),
    email: m.auth_email(),
    password: m.auth_password_placeholder(),
    confirmPassword: m.auth_confirm_password_placeholder(),
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
    email: m.validation_email(),
    passwordMismatch: m.auth_password_mismatch(),
  }}
  onsubmit={handleRegister}
>
  {#snippet footer()}
    <div class="text-center mt-4 text-sm text-base-content/60">
      <span>{m.auth_has_account()}</span>
      <a href="/auth/login" class="link link-primary ml-1">{m.auth_login_now()}</a>
    </div>
  {/snippet}
</RegisterForm>
