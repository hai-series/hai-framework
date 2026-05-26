<!--
  App.svelte —— 顶层路由 + 认证守卫。

  - 启动时调用 `refreshCurrentUser()` 尝试自动登录（基于 localStorage 中的 access token）。
  - 已登录 → AppShell 内嵌当前视图；未登录 → 强制跳 /login 或 /register。
-->
<script lang='ts'>
  import { Alert, ToastContainer } from '@h-ai/ui'
  import { onMount } from 'svelte'
  import {
    hasPermission,
    isAuthenticated,
    isInitialized,
    refreshCurrentUser,
  } from './lib/auth-store.svelte.js'
  import { currentPathname, installRouter, navigate } from './lib/router.svelte.js'
  import AppShellView from './views/AppShellView.svelte'
  import DashboardView from './views/DashboardView.svelte'
  import LoginView from './views/LoginView.svelte'
  import ProfileView from './views/ProfileView.svelte'
  import RegisterView from './views/RegisterView.svelte'
  import UsersView from './views/UsersView.svelte'

  onMount(() => {
    const dispose = installRouter()
    void refreshCurrentUser()
    return dispose
  })

  // 认证守卫：未登录用户只能停留在 /login 或 /register
  $effect(() => {
    if (!isInitialized())
      return
    const path = currentPathname()
    const isPublic = path === '/login' || path === '/register'
    if (!isAuthenticated() && !isPublic) {
      navigate('/login')
    }
    else if (isAuthenticated() && isPublic) {
      navigate('/dashboard')
    }
    else if (path === '/users' && !hasPermission('user:list')) {
      navigate('/dashboard')
    }
    else if (path === '/') {
      navigate(isAuthenticated() ? '/dashboard' : '/login')
    }
  })
</script>

{#if !isInitialized()}
  <div class='flex h-screen items-center justify-center'>
    <span class='loading loading-spinner loading-lg'></span>
  </div>
{:else if currentPathname() === '/login'}
  <LoginView />
{:else if currentPathname() === '/register'}
  <RegisterView />
{:else if isAuthenticated()}
  <AppShellView>
    {#if currentPathname() === '/dashboard'}
      <DashboardView />
    {:else if currentPathname() === '/users'}
      {#if hasPermission('user:list')}
        <UsersView />
      {:else}
        <div class='flex min-h-64 items-center justify-center'>
          <span class='loading loading-spinner loading-lg'></span>
        </div>
      {/if}
    {:else if currentPathname() === '/profile'}
      <ProfileView />
    {:else}
      <Alert variant='warning'>Unknown route: {currentPathname()}</Alert>
    {/if}
  </AppShellView>
{/if}

<ToastContainer />
