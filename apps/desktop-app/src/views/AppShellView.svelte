<!--
  AppShell — 已登录后的应用骨架。
  顶栏使用 @h-ai/ui 的 AppBar，右侧放 ThemeToggle + 用户名 + Logout。
  侧栏使用 @h-ai/ui 的 Button 组件渲染导航。
-->
<script lang='ts'>
  import type { Snippet } from 'svelte'
  import { AppBar, Button, ThemeToggle } from '@h-ai/ui'
  import { currentUser, hasPermission, logout } from '../lib/auth-store.svelte.js'
  import { currentPathname, navigate } from '../lib/router.svelte.js'

  interface Props {
    children: Snippet
  }

  const { children }: Props = $props()

  const navItems = $derived.by(() => {
    const items = [
      { path: '/dashboard', label: 'Dashboard' },
      { path: '/profile', label: 'Profile' },
    ]

    if (hasPermission('user:list')) {
      items.splice(1, 0, { path: '/users', label: 'Users' })
    }

    return items
  })

  async function handleLogout(): Promise<void> {
    await logout()
    navigate('/login')
  }
</script>

<div class='flex h-screen flex-col'>
  <AppBar title='hai Desktop' fixed={false} safeArea={false}>
    {#snippet trailing()}
      <div class='flex items-center gap-2'>
        <ThemeToggle />
        {#if currentUser()}
          <span class='text-sm opacity-70'>{currentUser()?.username}</span>
        {/if}
        <Button variant='ghost' size='sm' onclick={handleLogout}>Logout</Button>
      </div>
    {/snippet}
  </AppBar>

  <div class='flex flex-1 overflow-hidden'>
    <aside class='bg-base-200 border-base-300 flex w-56 flex-col gap-1 border-r p-3'>
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

    <main class='flex-1 overflow-auto p-6'>
      {@render children()}
    </main>
  </div>
</div>
