/**
 * =============================================================================
 * hai Admin Console - 登录页面
 * =============================================================================
 */
<script lang="ts">
  import { enhance } from '$app/forms'
  
  /**
   * 登录表单状态
   */
  let loading = $state(false)
  let error = $state('')
  
  /**
   * 表单数据
   */
  let username = $state('')
  let password = $state('')
  let rememberMe = $state(false)
</script>

<svelte:head>
  <title>登录 - hai Admin</title>
</svelte:head>

<div class="login-container">
  <div class="login-card">
    <div class="login-header">
      <h1 class="login-title">
        <span class="logo">hai</span> Admin
      </h1>
      <p class="login-subtitle">登录到管理后台</p>
    </div>
    
    {#if error}
      <div class="alert alert-error">
        {error}
      </div>
    {/if}
    
    <form
      method="POST"
      action="/login"
      use:enhance={() => {
        loading = true
        error = ''
        
        return async ({ result, update }) => {
          loading = false
          
          if (result.type === 'failure') {
            error = result.data?.message ?? '登录失败'
          } else if (result.type === 'redirect') {
            // 登录成功，跟随重定向
            await update()
          } else {
            await update()
          }
        }
      }}
    >
      <div class="form-group">
        <label for="username" class="label">用户名</label>
        <input
          type="text"
          id="username"
          name="username"
          class="input"
          placeholder="请输入用户名"
          bind:value={username}
          required
          autocomplete="username"
        />
      </div>
      
      <div class="form-group">
        <label for="password" class="label">密码</label>
        <input
          type="password"
          id="password"
          name="password"
          class="input"
          placeholder="请输入密码"
          bind:value={password}
          required
          autocomplete="current-password"
        />
      </div>
      
      <div class="form-group checkbox-group">
        <label class="checkbox-label">
          <input
            type="checkbox"
            name="rememberMe"
            bind:checked={rememberMe}
          />
          <span>记住我</span>
        </label>
        <a href="/forgot-password" class="forgot-link">忘记密码?</a>
      </div>
      
      <button type="submit" class="btn btn-primary" disabled={loading}>
        {#if loading}
          <span class="spinner"></span>
          登录中...
        {:else}
          登录
        {/if}
      </button>
    </form>
    
    <div class="login-footer">
      <p>演示账号: admin / admin123</p>
    </div>
  </div>
</div>

<style>
  .login-container {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    padding: 1rem;
  }
  
  .login-card {
    background: white;
    padding: 2rem;
    border-radius: 1rem;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
    width: 100%;
    max-width: 400px;
  }
  
  .login-header {
    text-align: center;
    margin-bottom: 2rem;
  }
  
  .login-title {
    font-size: 1.75rem;
    margin-bottom: 0.5rem;
  }
  
  .logo {
    color: #3b82f6;
    font-weight: 800;
  }
  
  .login-subtitle {
    color: #666;
    font-size: 0.875rem;
  }
  
  .alert {
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    margin-bottom: 1rem;
    font-size: 0.875rem;
  }
  
  .alert-error {
    background: #fef2f2;
    color: #dc2626;
    border: 1px solid #fecaca;
  }
  
  .form-group {
    margin-bottom: 1rem;
  }
  
  .label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
    font-size: 0.875rem;
    color: #333;
  }
  
  .input {
    width: 100%;
    padding: 0.75rem 1rem;
    border: 1px solid #ddd;
    border-radius: 0.5rem;
    font-size: 1rem;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  
  .input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
  
  .checkbox-group {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    cursor: pointer;
  }
  
  .forgot-link {
    color: #3b82f6;
    font-size: 0.875rem;
  }
  
  .forgot-link:hover {
    text-decoration: underline;
  }
  
  .btn {
    width: 100%;
    padding: 0.75rem 1rem;
    border: none;
    border-radius: 0.5rem;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }
  
  .btn-primary {
    background: #3b82f6;
    color: white;
  }
  
  .btn-primary:hover:not(:disabled) {
    background: #2563eb;
  }
  
  .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  
  .spinner {
    width: 1rem;
    height: 1rem;
    border: 2px solid transparent;
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  .login-footer {
    text-align: center;
    margin-top: 1.5rem;
    padding-top: 1.5rem;
    border-top: 1px solid #eee;
  }
  
  .login-footer p {
    color: #888;
    font-size: 0.75rem;
  }
</style>
