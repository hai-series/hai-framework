<!--
  AppShell — 已登录后的应用骨架。
  顶栏使用 @h-ai/ui 的 AppBar，右侧放 ThemeToggle + 用户名 + Logout。
  侧栏使用 @h-ai/ui 的 Button 组件渲染导航。
-->
<script lang='ts'>
  import type { Snippet } from 'svelte'
  import { AppBar, Button, LanguageSwitch, ThemeToggle, toast, WorkspaceLayout } from '@h-ai/ui'
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
      <div class='flex min-w-0 max-w-full items-center gap-2'>
        <LanguageSwitch compact currentLanguage={localeStore.current} onchange={language => localeStore.set(language)} />
        <ThemeToggle />
        {#if currentUser()}
          <span class='hidden max-w-40 truncate text-sm opacity-70 md:inline'>{currentUser()?.username}</span>
        {/if}
        <Button variant='ghost' size='sm' onclick={handleLogout}>{m('action_logout')}</Button>
      </div>
    {/snippet}
  </AppBar>

  <div class='flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden sm:flex-row'>
    <aside class='bg-base-200 border-base-300 flex w-full shrink-0 flex-row gap-1 overflow-x-auto border-b p-2 sm:w-56 sm:flex-col sm:border-r sm:border-b-0 sm:p-3'>
      {#each navItems as item (item.path)}
        <Button
          variant={currentPathname() === item.path ? 'primary' : 'ghost'}
          size='sm'
          class='shrink-0 justify-start'
          onclick={() => navigate(item.path)}
        >
          {item.label}
        </Button>
      {/each}
    </aside>

    <WorkspaceLayout>
      {@render children()}
    </WorkspaceLayout>
  </div>
</div>
