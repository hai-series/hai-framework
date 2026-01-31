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
  <title>Login - Admin Console</title>
</svelte:head>

<LoginForm
  {loading}
  {errors}
  showTitle
  showRegisterLink
  forgotPasswordUrl="/auth/forgot-password"
  registerUrl="/auth/register"
  onsubmit={handleLogin}
/>
