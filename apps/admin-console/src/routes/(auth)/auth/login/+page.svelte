<!--
  =============================================================================
  Admin Console - 登录页面
  =============================================================================
  使用 @hai/ui 的 LoginForm 场景组件
  =============================================================================
-->
<script lang="ts">
  import { goto } from '$app/navigation'
  import { LoginForm, type LoginFormData } from '@hai/ui'
  import * as m from '$lib/paraglide/messages'
  
  let loading = $state(false)
  let errors = $state<Record<string, string>>({})

  async function handleLogin(data: LoginFormData) {
    errors = {}
    loading = true

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          identifier: data.username, 
          password: data.password 
        }),
      })

      const result = await response.json()

      if (result.success) {
        goto('/admin')
      } else {
        errors = { general: result.error || m.auth_login_failed() }
      }
    } catch {
      errors = { general: m.common_network_error() }
    } finally {
      loading = false
    }
  }
</script>

<svelte:head>
  <title>{m.auth_login()} - Admin Console</title>
</svelte:head>

<h2 class="text-2xl font-semibold text-center mb-6">{m.auth_login()}</h2>

<LoginForm
  {loading}
  {errors}
  usernameLabel={m.auth_username_or_email()}
  usernamePlaceholder={m.auth_username_placeholder()}
  passwordLabel={m.auth_password()}
  passwordPlaceholder={m.auth_password_placeholder()}
  rememberMeLabel={m.auth_remember_me()}
  forgotPasswordLabel={m.auth_forgot_password()}
  submitText={m.auth_login()}
  forgotPasswordUrl="/auth/forgot-password"
  toggleLabels={{
    showPassword: m.auth_show_password(),
    hidePassword: m.auth_hide_password(),
  }}
  validationMessages={{
    required: m.validation_required(),
  }}
  onsubmit={handleLogin}
>
  {#snippet footer()}
    <div class="text-center mt-4 text-sm text-base-content/60">
      <span>{m.auth_no_account()}</span>
      <a href="/auth/register" class="link link-primary ml-1">{m.auth_register_now()}</a>
    </div>
  {/snippet}
</LoginForm>
