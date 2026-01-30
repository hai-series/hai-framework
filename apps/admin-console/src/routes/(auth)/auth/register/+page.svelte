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
        errors = { general: result.error || '注册失败' }
      }
    } catch {
      errors = { general: '网络错误，请稍后重试' }
    } finally {
      loading = false
    }
  }
</script>

<svelte:head>
  <title>注册 - Admin Console</title>
</svelte:head>

<h2 class="text-2xl font-semibold text-center mb-6">创建账号</h2>

<RegisterForm
  {loading}
  {errors}
  fields={['username', 'email', 'password']}
  requireConfirmPassword={true}
  showPasswordStrength={true}
  minPasswordLength={8}
  onsubmit={handleRegister}
>
  {#snippet footer()}
    <div class="text-center mt-4 text-sm text-base-content/60">
      <span>已有账号？</span>
      <a href="/auth/login" class="link link-primary ml-1">立即登录</a>
    </div>
  {/snippet}
</RegisterForm>
