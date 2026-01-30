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
  
  let loading = $state(false)
  let errors = $state<Record<string, string>>({})
  let success = $state(false)

  // 从 URL 获取 token
  const token = $derived($page.url.searchParams.get('token') ?? '')

  async function handleResetPassword(data: ResetPasswordFormData) {
    errors = {}

    if (!token) {
      errors = { general: '重置链接无效' }
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
        errors = { general: result.error || '重置失败' }
      }
    } catch {
      errors = { general: '网络错误，请稍后重试' }
    } finally {
      loading = false
    }
  }
</script>

<svelte:head>
  <title>重置密码 - Admin Console</title>
</svelte:head>

<h2 class="text-2xl font-semibold text-center mb-4">重置密码</h2>

{#if success}
  <Result
    status="success"
    title="密码重置成功"
    description="您的密码已成功重置，正在跳转到登录页..."
  >
    {#snippet actions()}
      <a href="/auth/login" class="btn btn-primary">立即登录</a>
    {/snippet}
  </Result>
{:else if !token}
  <Result
    status="warning"
    title="无效的链接"
    description="重置链接无效或已过期，请重新申请。"
  >
    {#snippet actions()}
      <a href="/auth/forgot-password" class="btn btn-primary">重新申请</a>
    {/snippet}
  </Result>
{:else}
  <p class="text-center text-base-content/60 text-sm mb-6">
    请输入您的新密码。
  </p>

  <ResetPasswordForm
    {loading}
    {errors}
    showCode={false}
    showPasswordStrength={true}
    minPasswordLength={8}
    onsubmit={handleResetPassword}
  />

  <div class="text-center mt-4 text-sm">
    <a href="/auth/login" class="link link-primary">← 返回登录</a>
  </div>
{/if}
