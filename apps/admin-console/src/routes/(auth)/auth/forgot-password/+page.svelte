<!--
  =============================================================================
  Admin Console - 忘记密码页面
  =============================================================================
-->
<script lang="ts">
  let email = $state('')
  let loading = $state(false)
  let error = $state('')
  let success = $state(false)

  async function handleSubmit(e: Event) {
    e.preventDefault()
    error = ''
    loading = true

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const result = await response.json()

      if (result.success) {
        success = true
      } else {
        error = result.error || '请求失败'
      }
    } catch (e) {
      error = '网络错误，请稍后重试'
    } finally {
      loading = false
    }
  }
</script>

<svelte:head>
  <title>忘记密码 - Admin Console</title>
</svelte:head>

<h2 class="auth-title">忘记密码</h2>

{#if success}
  <div class="success-message">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
    <h3>邮件已发送</h3>
    <p>如果该邮箱已注册，您将收到密码重置邮件。</p>
    <p class="hint">请检查您的收件箱（包括垃圾邮件文件夹）</p>
    <a href="/auth/login" class="back-link">返回登录</a>
  </div>
{:else}
  <p class="auth-description">
    请输入您的注册邮箱，我们将向您发送密码重置链接。
  </p>

  <form onsubmit={handleSubmit}>
    {#if error}
      <div class="error-message">{error}</div>
    {/if}

    <div class="form-group">
      <label for="email">邮箱地址</label>
      <input
        type="email"
        id="email"
        bind:value={email}
        placeholder="请输入注册时使用的邮箱"
        required
        disabled={loading}
      />
    </div>

    <button type="submit" class="submit-btn" disabled={loading}>
      {#if loading}
        <span class="spinner"></span>
        发送中...
      {:else}
        发送重置链接
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

  .success-message .hint {
    font-size: 0.75rem;
    margin-top: 0.5rem;
  }

  .success-message .back-link {
    display: inline-block;
    margin-top: 1.5rem;
    color: #667eea;
    text-decoration: none;
    font-size: 0.875rem;
  }

  .success-message .back-link:hover {
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
