<script lang="ts">
  /**
   * 注册页 — 使用 @h-ai/iam 创建新账户
   */
  import { goto } from '$app/navigation'

  let username = $state('')
  let email = $state('')
  let password = $state('')
  let loading = $state(false)
  let error = $state('')

  async function handleRegister(e: Event) {
    e.preventDefault()
    loading = true
    error = ''

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password }),
      })
      const data = await res.json()

      if (data.success) {
        goto('/profile')
      }
      else {
        error = data.error?.message ?? '注册失败'
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
  <title>注册 - H5 应用</title>
</svelte:head>

<div class="min-h-screen flex flex-col bg-base-100">
  <div class="p-4">
    <a href="/" class="btn btn-ghost btn-sm">← 返回</a>
  </div>

  <div class="flex-1 flex flex-col justify-center px-6 pb-20">
    <h1 class="text-2xl font-bold text-center mb-2">创建账户</h1>
    <p class="text-center text-gray-500 mb-8">注册新账户开始使用</p>

    {#if error}
      <div class="alert alert-error mb-4 text-sm">
        <span>{error}</span>
      </div>
    {/if}

    <form class="space-y-4" onsubmit={handleRegister}>
      <div class="form-control">
        <label class="label" for="username">
          <span class="label-text">用户名</span>
        </label>
        <input
          id="username"
          type="text"
          placeholder="3-30 个字符"
          class="input input-bordered w-full"
          bind:value={username}
          required
          minlength="3"
          maxlength="30"
        />
      </div>

      <div class="form-control">
        <label class="label" for="email">
          <span class="label-text">邮箱</span>
        </label>
        <input
          id="email"
          type="email"
          placeholder="请输入邮箱"
          class="input input-bordered w-full"
          bind:value={email}
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
          placeholder="至少 6 个字符"
          class="input input-bordered w-full"
          bind:value={password}
          required
          minlength="6"
        />
      </div>

      <button type="submit" class="btn btn-primary w-full" disabled={loading}>
        {#if loading}
          <span class="loading loading-spinner loading-sm"></span>
          注册中...
        {:else}
          注册
        {/if}
      </button>
    </form>

    <p class="text-center mt-6 text-sm text-gray-500">
      已有账户？
      <a href="/auth/login" class="text-primary font-medium">去登录</a>
    </p>
  </div>
</div>
