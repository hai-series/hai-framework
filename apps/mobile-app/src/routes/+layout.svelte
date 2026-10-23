<script lang='ts'>
  import { browser } from '$app/environment'
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/stores'
  import { closeApi, initApi } from '$lib/api'
  import { initCapacitor } from '$lib/capacitor'
  import * as m from '$lib/paraglide/messages.js'
  import {
    hasPermission,
    isAuthenticated,
    isInitialized,
    refreshCurrentUser,
  } from '$lib/stores/auth-store.svelte.js'
  import { changeLocale, localeStore } from '$lib/stores/locale-store.svelte.js'
  import { applyTheme, getSavedTheme } from '@h-ai/ui'
  import { onMount } from 'svelte'
  import '../app.css'

  const { children } = $props()

  let booting = $state(true)
  let bootError = $state<string | null>(null)

  type TabId = 'dashboard' | 'users' | 'profile'
  type TabRoute = '/' | '/users' | '/profile'

  const tabRoutes: Record<TabId, TabRoute> = {
    dashboard: '/',
    users: '/users',
    profile: '/profile',
  }

  const navItems = $derived.by(() => {
    // Paraglide 文案通过共享语言状态触发重新求值。
    void localeStore.current
    const items = [
      { id: 'dashboard', label: m.nav_dashboard(), iconClass: 'icon-[tabler--layout-dashboard]' },
      { id: 'profile', label: m.nav_profile(), iconClass: 'icon-[tabler--user]' },
    ]

    if (hasPermission('user:list')) {
      items.splice(1, 0, { id: 'users', label: m.nav_users(), iconClass: 'icon-[tabler--users]' })
    }

    return items
  })

  const activeTab = $derived.by(() => {
    const path = $page.url.pathname
    if (path.startsWith('/users'))
      return 'users'
    if (path.startsWith('/profile'))
      return 'profile'
    return 'dashboard'
  })

  const isAuthPage = $derived($page.url.pathname.startsWith('/auth'))

  function handleTabChange(id: string): void {
    if (!(id in tabRoutes))
      return

    void goto(resolve(tabRoutes[id as TabId], {}))
  }

  async function bootstrap(): Promise<void> {
    try {
      const theme = getSavedTheme()
      applyTheme(theme, false)
      changeLocale(localeStore.current)

      await initCapacitor()
      await initApi()
      await refreshCurrentUser()
    }
    catch (error) {
      bootError = error instanceof Error ? error.message : m.common_unknown_error()
    }
    finally {
      booting = false
    }
  }

  onMount(() => {
    void bootstrap()

    return () => {
      void closeApi()
    }
  })

  $effect(() => {
    if (browser)
      document.documentElement.lang = localeStore.current
  })

  $effect(() => {
    if (!browser || booting || bootError || !isInitialized())
      return

    const path = $page.url.pathname
    if (!isAuthenticated() && !path.startsWith('/auth')) {
      void goto(resolve('/auth/login', {}))
      return
    }

    if (isAuthenticated() && path.startsWith('/auth')) {
      void goto(resolve('/', {}))
      return
    }

    if (path.startsWith('/users') && !hasPermission('user:list')) {
      void goto(resolve('/', {}))
    }
  })
</script>

{#key localeStore.current}
  {#if booting}
    <div class='hai-mobile-viewport'>
      <div class='hai-mobile-shell min-w-0'>
        <div class='flex min-h-screen items-center justify-center'>
          <span class='loading loading-spinner loading-lg'></span>
        </div>
      </div>
    </div>
  {:else if bootError}
    <div class='hai-mobile-viewport'>
      <div class='hai-mobile-shell min-w-0'>
        <div class='flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center'>
          <span class='icon-[tabler--alert-triangle] text-error text-4xl'></span>
          <h1 class='text-lg font-bold'>{m.boot_failed_title()}</h1>
          <p class='text-base-content/60 text-sm'>{bootError}</p>
          <Button variant='primary' size='sm' onclick={() => location.reload()}>{m.common_retry()}</Button>
        </div>
      </div>
    </div>
  {:else if isAuthPage}
    {@render children()}
  {:else}
    <div class='hai-mobile-viewport'>
      <div class='hai-mobile-shell min-w-0'>
        <AppBar title={m.app_title()} safeArea fixed={false} class='bg-base-100/95 backdrop-blur border-base-content/8' />

        <main class='hai-mobile-main'>
          {@render children()}
        </main>

        <BottomNav
          items={navItems}
          active={activeTab}
          onchange={handleTabChange}
          safeArea
          centered
          maxWidth='none'
          class='border-base-content/8 shadow-[0_-12px_32px_rgba(15,23,42,0.08)]'
        />
      </div>
    </div>
  {/if}
{/key}

<ToastContainer />
