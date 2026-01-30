<!--
  =============================================================================
  Admin Console - 重置密码页面
  =============================================================================
-->
<script lang="ts">
  import { page } from '$app/stores'
  import { goto } from '$app/navigation'
  
  let password = $state('')
  let confirmPassword = $state('')
  let loading = $state(false)
  let error = $state('')
  let success = $state(false)

  // 从 URL 获取 token
  const token = $derived($page.url.searchParams.get('token') ?? '')

  async function handleSubmit(e: Event) {
    e.preventDefault()
    error = ''

    if (!token) {
      error = '重置链接无效'
      return
    }

    if (password !== confirmPassword) {
      error = '两次输入的密码不一致'
      return
    }

    loading = true

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, confirmPassword }),
      })

      const result = await response.json()

      if (result.success) {
        success = true
        // 3秒后跳转到登录页
        setTimeout(() => goto('/auth/login'), 3000)
      } else {
        error = result.error || '重置失败'
      }
    } catch (e) {
      error = '网络错误，请稍后重试'
    } finally {
      loading = false
    }
  }
</script>

<svelte:head>
  <title>重置密码 - Admin Console</title>
</svelte:head>

<h2 class="auth-title">重置密码</h2>

{#if success}
  <div class="success-message">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
    <h3>密码重置成功</h3>
    <p>您的密码已成功重置，正在跳转到登录页...</p>
    <a href="/auth/login" class="back-link">立即登录</a>
  </div>
{:else if !token}
  <div class="error-box">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
    <h3>无效的链接</h3>
    <p>重置链接无效或已过期，请重新申请。</p>
    <a href="/auth/forgot-password" class="back-link">重新申请</a>
  </div>
{:else}
  <p class="auth-description">
    请输入您的新密码。
  </p>

  <form onsubmit={handleSubmit}>
    {#if error}
      <div class="error-message">{error}</div>
    {/if}

    <div class="form-group">
      <label for="password">新密码</label>
      <input
        type="password"
        id="password"
        bind:value={password}
        placeholder="至少8位，包含字母和数字"
        required
        disabled={loading}
        minlength={8}
      />
    </div>

    <div class="form-group">
      <label for="confirmPassword">确认新密码</label>
      <input
        type="password"
        id="confirmPassword"
        bind:value={confirmPassword}
        placeholder="请再次输入新密码"
        required
        disabled={loading}
      />
    </div>

    <button type="submit" class="submit-btn" disabled={loading}>
      {#if loading}
        <span class="spinner"></span>
        重置中...
      {:else}
        重置密码
      {/if}
    </button>

    <div class="auth-links">
      <a href="/auth/login">← 返回登录</a>
    </div>
  </form>
{/if}

<style>
  .auth-title {
    font-size: 1.5rem;
    font-weight: 600;
    text-align: center;
    margin: 0 0 1rem;
    color: #1f2937;
  }

  .auth-description {
    text-align: center;
    color: #6b7280;
    font-size: 0.875rem;
    margin-bottom: 1.5rem;
  }

  .form-group {
    margin-bottom: 1rem;
  }

  .form-group label {
    display: block;
    font-size: 0.875rem;
    font-weight: 500;
    color: #374151;
    margin-bottom: 0.375rem;
  }

  .form-group input {
    width: 100%;
    padding: 0.625rem 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    transition: border-color 0.15s, box-shadow 0.15s;
  }

  .form-group input:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  }

  .form-group input:disabled {
    background-color: #f3f4f6;
    cursor: not-allowed;
  }

  .error-message {
    background-color: #fef2f2;
    border: 1px solid #fecaca;
    color: #dc2626;
    padding: 0.75rem;
    border-radius: 0.5rem;
    margin-bottom: 1rem;
    font-size: 0.875rem;
  }

  .error-box {
    text-align: center;
    padding: 1rem 0;
  }

  .error-box svg {
    color: #f59e0b;
    margin-bottom: 1rem;
  }

  .error-box h3 {
    font-size: 1.125rem;
    font-weight: 600;
    color: #1f2937;
    margin: 0 0 0.5rem;
  }

  .error-box p {
    color: #6b7280;
    font-size: 0.875rem;
    margin: 0;
  }

  .error-box .back-link {
    display: inline-block;
    margin-top: 1.5rem;
    color: #667eea;
    text-decoration: none;
    font-size: 0.875rem;
  }

  .success-message {
    text-align: center;
    padding: 1rem 0;
  }

  .success-message svg {
    color: #10b981;
    margin-bottom: 1rem;
  }

  .success-message h3 {
    font-size: 1.125rem;
    font-weight: 600;
    color: #1f2937;
    margin: 0 0 0.5rem;
  }

  .success-message p {
    color: #6b7280;
    font-size: 0.875rem;
    margin: 0;
  }

  .success-message .back-link {
    display: inline-block;
    margin-top: 1.5rem;
    color: #667eea;
    text-decoration: none;
    font-size: 0.875rem;
  }

  .success-message .back-link:hover,
  .error-box .back-link:hover {
    text-decoration: underline;
  }

  .submit-btn {
    width: 100%;
    padding: 0.75rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    margin-top: 1rem;
  }

  .submit-btn:hover:not(:disabled) {
    opacity: 0.9;
  }

  .submit-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .spinner {
    width: 1rem;
    height: 1rem;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .auth-links {
    text-align: center;
    margin-top: 1.5rem;
    font-size: 0.875rem;
  }

  .auth-links a {
    color: #667eea;
    text-decoration: none;
  }

  .auth-links a:hover {
    text-decoration: underline;
  }
</style>
