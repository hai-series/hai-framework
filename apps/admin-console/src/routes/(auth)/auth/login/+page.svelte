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
        errors = { general: result.error || '登录失败' }
      }
    } catch {
      errors = { general: '网络错误，请稍后重试' }
    } finally {
      loading = false
    }
  }
</script>

<svelte:head>
  <title>登录 - Admin Console</title>
</svelte:head>

<h2 class="text-2xl font-semibold text-center mb-6">登录</h2>

<LoginForm
  {loading}
  {errors}
  usernameLabel="用户名 / 邮箱"
  usernamePlaceholder="请输入用户名或邮箱"
  passwordPlaceholder="请输入密码"
  forgotPasswordUrl="/auth/forgot-password"
  onsubmit={handleLogin}
>
  {#snippet footer()}
    <div class="text-center mt-4 text-sm text-base-content/60">
      <span>还没有账号？</span>
      <a href="/auth/register" class="link link-primary ml-1">立即注册</a>
    </div>
  {/snippet}
</LoginForm>
