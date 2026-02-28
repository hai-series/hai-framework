<script lang="ts">
  /**
   * 个人中心页 — 集成 @h-ai/iam 用户认证和 @h-ai/storage 头像上传
   */
  import { goto } from '$app/navigation'

  let user = $state<{ id: string, username: string, displayName?: string, avatarUrl?: string, email?: string } | null>(null)
  let loading = $state(true)
  let uploading = $state(false)

  const menuItems = [
    { icon: '📦', label: '我的订单', badge: '3' },
    { icon: '💳', label: '我的钱包', badge: '' },
    { icon: '📍', label: '收货地址', badge: '' },
    { icon: '⭐', label: '我的收藏', badge: '12' },
    { icon: '🎫', label: '优惠券', badge: '5' },
    { icon: '⚙️', label: '设置', badge: '' },
  ]

  $effect(() => {
    fetchProfile()
  })

  async function fetchProfile() {
    try {
      const res = await fetch('/api/user/profile')
      const data = await res.json()
      if (data.success) {
        user = data.data
      }
    }
    catch {
      // 未登录
    }
    finally {
      loading = false
    }
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    user = null
  }

  async function handleAvatarUpload(e: Event) {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return

    uploading = true
    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const data = await res.json()

      if (data.success) {
        // 头像上传成功
        if (user) {
          user = { ...user, avatarUrl: data.data.key }
        }
      }
    }
    catch {
      // 上传失败
    }
    finally {
      uploading = false
    }
  }
</script>

<svelte:head>
  <title>我的 - H5 应用</title>
</svelte:head>

<div>
  <!-- 用户信息卡片 -->
  <div class="bg-primary text-primary-content p-6 pb-10">
    {#if loading}
      <div class="flex items-center gap-4">
        <div class="skeleton w-16 h-16 rounded-full bg-primary-content/20"></div>
        <div>
          <div class="skeleton h-5 w-24 mb-2 bg-primary-content/20"></div>
          <div class="skeleton h-4 w-32 bg-primary-content/20"></div>
        </div>
      </div>
    {:else if user}
      <div class="flex items-center gap-4">
        <label class="avatar cursor-pointer relative">
          <div class="w-16 rounded-full">
            {#if user.avatarUrl}
              <img src={`/api/upload/${user.avatarUrl}`} alt={user.username} class="rounded-full" />
            {:else}
              <div class="bg-neutral text-neutral-content w-16 h-16 rounded-full flex items-center justify-center">
                <span class="text-2xl">{user.username.charAt(0).toUpperCase()}</span>
              </div>
            {/if}
          </div>
          <input type="file" accept="image/*" class="hidden" onchange={handleAvatarUpload} />
          {#if uploading}
            <span class="loading loading-spinner loading-xs absolute bottom-0 right-0"></span>
          {/if}
        </label>
        <div>
          <h2 class="text-lg font-bold">{user.displayName ?? user.username}</h2>
          <p class="text-sm opacity-80">{user.email ?? ''}</p>
        </div>
      </div>
    {:else}
      <div class="flex items-center gap-4">
        <div class="avatar placeholder">
          <div class="bg-neutral text-neutral-content w-16 rounded-full">
            <span class="text-2xl">👤</span>
          </div>
        </div>
        <div>
          <h2 class="text-lg font-bold">未登录</h2>
          <a href="/auth/login" class="text-sm opacity-80 underline">点击登录享更多权益</a>
        </div>
      </div>
    {/if}
  </div>

  <!-- 统计 -->
  <div class="bg-base-100 rounded-t-2xl -mt-4 pt-4 px-4">
    <div class="grid grid-cols-4 text-center py-3">
      <div>
        <p class="font-bold">0</p>
        <p class="text-xs text-gray-500">待付款</p>
      </div>
      <div>
        <p class="font-bold">0</p>
        <p class="text-xs text-gray-500">待发货</p>
      </div>
      <div>
        <p class="font-bold">0</p>
        <p class="text-xs text-gray-500">待收货</p>
      </div>
      <div>
        <p class="font-bold">0</p>
        <p class="text-xs text-gray-500">待评价</p>
      </div>
    </div>

    <div class="divider my-0"></div>

    <!-- 菜单列表 -->
    <ul class="menu p-0">
      {#each menuItems as item}
        <li>
          <button class="flex items-center justify-between w-full">
            <span class="flex items-center gap-3">
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </span>
            {#if item.badge}
              <span class="badge badge-sm badge-primary">{item.badge}</span>
            {/if}
          </button>
        </li>
      {/each}
    </ul>

    <!-- 登出按钮 -->
    {#if user}
      <div class="px-2 py-4">
        <button class="btn btn-outline btn-error w-full btn-sm" onclick={handleLogout}>退出登录</button>
      </div>
    {/if}
  </div>
</div>
