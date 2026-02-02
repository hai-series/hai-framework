<!--
  =============================================================================
  Admin Console - 注册页面
  =============================================================================
  使用 @hai/ui 的 RegisterForm 场景组件
  =============================================================================
-->
<script lang="ts">
  import { goto } from '$app/navigation'
  import type { RegisterFormData } from '@hai/ui'
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
  <title>Register - Admin Console</title>
</svelte:head>

<RegisterForm
  {loading}
  {errors}
  showTitle
  showLoginLink
  fields={['username', 'email', 'password']}
  requireConfirmPassword={true}
  showPasswordStrength={true}
  minPasswordLength={8}
  loginUrl="/auth/login"
  onsubmit={handleRegister}
/>
