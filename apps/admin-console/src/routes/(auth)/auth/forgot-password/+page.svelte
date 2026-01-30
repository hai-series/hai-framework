<!--
  =============================================================================
  Admin Console - 忘记密码页面
  =============================================================================
  使用 @hai/ui 的 ForgotPasswordForm 场景组件
  =============================================================================
-->
<script lang="ts">
  import { ForgotPasswordForm, type ForgotPasswordFormData, Result } from '@hai/ui'
  
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
        errors = { general: result.error || '请求失败' }
      }
    } catch {
      errors = { general: '网络错误，请稍后重试' }
    } finally {
      loading = false
    }
  }
</script>

<svelte:head>
  <title>忘记密码 - Admin Console</title>
</svelte:head>

<h2 class="text-2xl font-semibold text-center mb-4">忘记密码</h2>

{#if success}
  <Result
    status="success"
    title="邮件已发送"
    description="如果该邮箱已注册，您将收到密码重置邮件。请检查您的收件箱（包括垃圾邮件文件夹）"
  >
    {#snippet actions()}
      <a href="/auth/login" class="btn btn-primary">返回登录</a>
    {/snippet}
  </Result>
{:else}
  <p class="text-center text-base-content/60 text-sm mb-6">
    请输入您的注册邮箱，我们将向您发送密码重置链接。
  </p>

  <ForgotPasswordForm
    {loading}
    {errors}
    mode="email"
    submitText="发送重置链接"
    onsubmit={handleForgotPassword}
  >
    {#snippet footer()}
      <div class="text-center mt-4 text-sm">
        <a href="/auth/login" class="link link-primary">← 返回登录</a>
      </div>
    {/snippet}
  </ForgotPasswordForm>
{/if}
