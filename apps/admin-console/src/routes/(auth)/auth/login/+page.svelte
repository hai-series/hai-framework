<!--
  =============================================================================
  Admin Console - 登录页面
  =============================================================================
-->
<script lang="ts">
  import { goto } from '$app/navigation'
  
  let identifier = $state('')
  let password = $state('')
  let loading = $state(false)
  let error = $state('')

  async function handleSubmit(e: Event) {
    e.preventDefault()
    error = ''
    loading = true

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      })

      const result = await response.json()

      if (result.success) {
        goto('/admin')
      } else {
        error = result.error || '登录失败'
      }
    } catch (e) {
      error = '网络错误，请稍后重试'
    } finally {
      loading = false
    }
  }
</script>

<svelte:head>
  <title>登录 - Admin Console</title>
</svelte:head>

<h2 class="auth-title">登录</h2>

<form onsubmit={handleSubmit}>
  {#if error}
    <div class="error-message">{error}</div>
  {/if}

  <div class="form-group">
    <label for="identifier">用户名 / 邮箱</label>
    <input
      type="text"
      id="identifier"
      bind:value={identifier}
      placeholder="请输入用户名或邮箱"
      required
      disabled={loading}
    />
  </div>

  <div class="form-group">
    <label for="password">密码</label>
    <input
      type="password"
      id="password"
      bind:value={password}
      placeholder="请输入密码"
      required
      disabled={loading}
    />
  </div>

  <div class="form-actions">
    <a href="/auth/forgot-password" class="forgot-link">忘记密码？</a>
  </div>

  <button type="submit" class="submit-btn" disabled={loading}>
    {#if loading}
      <span class="spinner"></span>
      登录中...
    {:else}
      登录
    {/if}
  </button>

  <div class="auth-links">
    <span>还没有账号？</span>
    <a href="/auth/register">立即注册</a>
  </div>
</form>

<style>
  .auth-title {
    font-size: 1.5rem;
    font-weight: 600;
    text-align: center;
    margin: 0 0 1.5rem;
    color: #1f2937;
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

  .form-actions {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 1rem;
  }

  .forgot-link {
    font-size: 0.875rem;
    color: #667eea;
    text-decoration: none;
  }

  .forgot-link:hover {
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
    color: #6b7280;
  }

  .auth-links a {
    color: #667eea;
    text-decoration: none;
    margin-left: 0.25rem;
  }

  .auth-links a:hover {
    text-decoration: underline;
  }
</style>
