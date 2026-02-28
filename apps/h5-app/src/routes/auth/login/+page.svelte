<script lang="ts">
  /**
   * 登录页 — 使用 @h-ai/iam 进行身份验证
   */
  import { goto } from '$app/navigation'

  let identifier = $state('')
  let password = $state('')
  let loading = $state(false)
  let error = $state('')

  async function handleLogin(e: Event) {
    e.preventDefault()
    loading = true
    error = ''

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      })
      const data = await res.json()

      if (data.success) {
        goto('/profile')
      }
      else {
        error = data.error?.message ?? '登录失败'
      }
    }
    catch {
      error = '网络错误，请重试'
    }
    finally {
      loading = false
    }
  }
</script>

<svelte:head>
  <title>登录 - H5 应用</title>
</svelte:head>

<div class="min-h-screen flex flex-col bg-base-100">
  <!-- 返回按钮 -->
  <div class="p-4">
    <a href="/" class="btn btn-ghost btn-sm">← 返回</a>
  </div>

  <div class="flex-1 flex flex-col justify-center px-6 pb-20">
    <h1 class="text-2xl font-bold text-center mb-2">欢迎回来</h1>
    <p class="text-center text-gray-500 mb-8">登录您的账户</p>

    {#if error}
      <div class="alert alert-error mb-4 text-sm">
        <span>{error}</span>
      </div>
    {/if}

    <form class="space-y-4" onsubmit={handleLogin}>
      <div class="form-control">
        <label class="label" for="identifier">
          <span class="label-text">用户名 / 邮箱</span>
        </label>
        <input
          id="identifier"
          type="text"
          placeholder="请输入用户名或邮箱"
          class="input input-bordered w-full"
          bind:value={identifier}
          required
        />
      </div>

      <div class="form-control">
        <label class="label" for="password">
          <span class="label-text">密码</span>
        </label>
        <input
          id="password"
          type="password"
          placeholder="请输入密码"
          class="input input-bordered w-full"
          bind:value={password}
          required
        />
      </div>

      <button type="submit" class="btn btn-primary w-full" disabled={loading}>
        {#if loading}
          <span class="loading loading-spinner loading-sm"></span>
          登录中...
        {:else}
          登录
        {/if}
      </button>
    </form>

    <p class="text-center mt-6 text-sm text-gray-500">
      还没有账户？
      <a href="/auth/register" class="text-primary font-medium">立即注册</a>
    </p>
  </div>
</div>
