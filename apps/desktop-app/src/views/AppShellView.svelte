<!--
  AppShell — 已登录后的应用骨架。
  顶栏使用 @h-ai/ui 的 AppBar，右侧放 ThemeToggle + 用户名 + Logout。
  侧栏使用 @h-ai/ui 的 Button 组件渲染导航。
-->
<script lang='ts'>
  import type { Snippet } from 'svelte'
  import { AppBar, Button, LanguageSwitch, ThemeToggle, toast } from '@h-ai/ui'
  import { currentUser, hasPermission, logout } from '../lib/auth-store.svelte.js'
  import { localeStore, desktopM as m } from '../lib/messages.svelte.js'
  import { currentPathname, navigate } from '../lib/router.svelte.js'

  interface Props {
    children: Snippet
  }

  const { children }: Props = $props()

  const navItems = $derived.by(() => {
    const items = [
      { path: '/dashboard', label: m('nav_dashboard') },
      { path: '/profile', label: m('nav_profile') },
    ]

    if (hasPermission('user:list')) {
      items.splice(1, 0, { path: '/users', label: m('nav_users') })
    }

    return items
  })

  async function handleLogout(): Promise<void> {
    const error = await logout()
    if (error)
      toast.error(error)
    navigate('/login')
  }
</script>

<div class='flex h-screen flex-col'>
  <AppBar title={m('app_title')} fixed={false} safeArea={false}>
    {#snippet trailing()}
      <div class='flex items-center gap-2'>
        <LanguageSwitch currentLanguage={localeStore.current} onchange={language => localeStore.set(language)} />
        <ThemeToggle />
        {#if currentUser()}
          <span class='text-sm opacity-70'>{currentUser()?.username}</span>
        {/if}
        <Button variant='ghost' size='sm' onclick={handleLogout}>{m('action_logout')}</Button>
      </div>
    {/snippet}
  </AppBar>

  <div class='flex min-h-0 flex-1 overflow-hidden'>
    <aside class='bg-base-200 border-base-300 flex w-56 shrink-0 flex-col gap-1 border-r p-3'>
      {#each navItems as item (item.path)}
        <Button
          variant={currentPathname() === item.path ? 'primary' : 'ghost'}
          size='sm'
          class='justify-start'
          onclick={() => navigate(item.path)}
        >
          {item.label}
        </Button>
      {/each}
    </aside>

    <main class='flex min-h-0 min-w-0 flex-1 flex-col overflow-auto p-4 sm:p-6'>
      {@render children()}
    </main>
  </div>
</div>
