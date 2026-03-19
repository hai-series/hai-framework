<script lang="ts">
  /**
   * 个人中心页 — 集成 @h-ai/iam 用户认证、@h-ai/storage 头像上传、ActionSheet 操作菜单
   */
  import * as m from '$lib/paraglide/messages.js'
  import { Avatar, Badge, Button, Card, Skeleton, Spinner, ActionSheet } from '@h-ai/ui'

  let user = $state<{ id: string, username: string, displayName?: string, avatarUrl?: string, email?: string } | null>(null)
  let loading = $state(true)
  let uploading = $state(false)
  let showActions = $state(false)

  const menuItems = [
    { icon: 'icon-[tabler--package]', label: m.profile_menu_orders, badge: '3' },
    { icon: 'icon-[tabler--wallet]', label: m.profile_menu_wallet, badge: '' },
    { icon: 'icon-[tabler--map-pin]', label: m.profile_menu_address, badge: '' },
    { icon: 'icon-[tabler--star]', label: m.profile_menu_favorites, badge: '12' },
    { icon: 'icon-[tabler--ticket]', label: m.profile_menu_coupon, badge: '5' },
    { icon: 'icon-[tabler--settings]', label: m.profile_menu_settings, badge: '' },
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

  function handleActionSelect(id: string) {
    if (id === 'share') {
      // 分享逻辑
    }
    else if (id === 'edit') {
      // 编辑资料
    }
    else if (id === 'clear') {
      // 清缓存
    }
  }
</script>

<svelte:head>
  <title>{m.profile_title()} - {m.app_title()}</title>
</svelte:head>

<div>
  <!-- 用户信息卡片 -->
  <div class="bg-linear-to-br from-primary to-primary/80 text-primary-content p-6 pb-10">
    {#if loading}
      <div class="flex items-center gap-4">
        <Skeleton variant="avatar" class="w-16 h-16 bg-primary-content/20" />
        <div class="space-y-2">
          <Skeleton variant="title" width="6rem" class="bg-primary-content/20" />
          <Skeleton variant="text" width="8rem" class="bg-primary-content/20" />
        </div>
      </div>
    {:else if user}
      <div class="flex items-center gap-4">
        <label class="relative cursor-pointer">
          {#if user.avatarUrl}
            <Avatar src={`/api/upload/${user.avatarUrl}`} alt={user.username} size="xl" />
          {:else}
            <Avatar name={user.displayName ?? user.username} size="xl" />
          {/if}
          <input type="file" accept="image/*" class="hidden" onchange={handleAvatarUpload} />
          {#if uploading}
            <span class="absolute bottom-0 right-0">
              <Spinner size="xs" />
            </span>
          {/if}
        </label>
        <div>
          <h2 class="text-lg font-bold">{user.displayName ?? user.username}</h2>
          <p class="text-sm opacity-80">{user.email ?? ''}</p>
        </div>
      </div>
    {:else}
      <div class="flex items-center gap-4">
        <Avatar name="?" size="xl" class="opacity-60" />
        <div>
          <h2 class="text-lg font-bold">{m.profile_guest_title()}</h2>
          <a href="/auth/login" class="text-sm opacity-80 underline">{m.profile_guest_login_hint()}</a>
        </div>
      </div>
    {/if}
  </div>

  <!-- 统计 -->
  <div class="bg-base-100 rounded-t-2xl -mt-4 pt-4 px-4">
    <Card padding="sm" shadow="sm">
      <div class="grid grid-cols-4 text-center py-1">
        <div>
          <p class="font-bold text-base-content">0</p>
          <p class="text-xs text-base-content/50">{m.profile_stat_pending_pay()}</p>
        </div>
        <div>
          <p class="font-bold text-base-content">0</p>
          <p class="text-xs text-base-content/50">{m.profile_stat_pending_ship()}</p>
        </div>
        <div>
          <p class="font-bold text-base-content">0</p>
          <p class="text-xs text-base-content/50">{m.profile_stat_pending_receive()}</p>
        </div>
        <div>
          <p class="font-bold text-base-content">0</p>
          <p class="text-xs text-base-content/50">{m.profile_stat_pending_review()}</p>
        </div>
      </div>
    </Card>

    <!-- 菜单列表 -->
    <div class="mt-4">
      <Card padding="none" shadow="sm">
        {#each menuItems as item, i}
          <button class="flex items-center w-full px-4 py-3 active:bg-base-200/60 transition-colors">
            <span class="{item.icon} text-xl text-primary/70 mr-3"></span>
            <span class="flex-1 text-left text-sm">{item.label()}</span>
            <span class="flex items-center gap-2 text-base-content/40">
              {#if item.badge}
                <Badge variant="primary" size="sm">{item.badge}</Badge>
              {/if}
              <span class="icon-[tabler--chevron-right] text-lg"></span>
            </span>
          </button>
          {#if i < menuItems.length - 1}
            <div class="border-b border-base-200 ml-12"></div>
          {/if}
        {/each}
      </Card>
    </div>

    <!-- 登出按钮 -->
    {#if user}
      <div class="px-4 pt-2 pb-2">
        <Button variant="ghost" size="sm" class="w-full" onclick={() => showActions = true}>
          <span class="icon-[tabler--dots] text-lg"></span>
          {m.action_more()}
        </Button>
      </div>
      <div class="px-4 pb-6">
        <Button variant="error" outline class="w-full" size="sm" onclick={handleLogout}>
          <span class="icon-[tabler--logout] text-lg"></span>
          {m.profile_logout()}
        </Button>
      </div>
    {/if}
  </div>
</div>

<!-- 更多操作菜单 -->
<ActionSheet
  open={showActions}
  title={m.action_more()}
  cancelText={m.action_cancel()}
  items={[
    { id: 'share', label: m.action_share() },
    { id: 'edit', label: m.action_edit_profile() },
    { id: 'clear', label: m.action_clear_cache(), destructive: true },
  ]}
  onselect={handleActionSelect}
  onclose={() => showActions = false}
/>
