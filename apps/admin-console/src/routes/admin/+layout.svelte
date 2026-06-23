<!--
  hai Admin Console - 后台布局
  侧边栏 + 顶栏布局
-->
<script lang='ts'>
  import type { Snippet } from 'svelte'
  import type { LayoutData } from './$types'
  import { browser } from '$app/environment'
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import * as m from '$lib/paraglide/messages'
  import { apiFetch } from '$lib/utils/api'
  import { applyTheme, getSavedTheme, setPermissionContext, usePermission } from '@h-ai/ui'
  import { SvelteSet } from 'svelte/reactivity'

  interface Props {
    data: LayoutData
    children: Snippet
  }

  const { data, children }: Props = $props()

  const appName = $derived(data.appConfig?.name ?? m.app_title())
  const appVersion = $derived(data.appConfig?.version ?? '0.1.0')
  const userPermissions = $derived(data.user?.permissions ?? [])

  // 注入权限上下文，子组件通过 usePermission() 消费
  setPermissionContext(() => userPermissions)
  const { hasPerm } = usePermission()

  let sidebarCollapsed = $state(false)
  let mobileMenuOpen = $state(false)
  let userMenuOpen = $state(false)

  // 顶栏主题快速切换（亮/暗）
  let currentTheme = $derived(browser ? getSavedTheme() : 'light')

  function handleThemeChange(theme: string) {
    applyTheme(theme)
    currentTheme = theme
  }

  type AdminResolvedPath = '/admin' | '/admin/iam/users' | '/admin/iam/roles' | '/admin/iam/permissions' | '/admin/ui-gallery' | '/admin/modules' | '/admin/logs' | '/admin/settings' | '/admin/profile'

  type AdminNavPath = AdminResolvedPath | '/admin/iam'

  const emptyRouteParams = {}
  const authLoginPath = resolve('/auth/login', {})
  const adminHomePath = resolve('/admin', emptyRouteParams)
  const adminProfilePath = resolve('/admin/profile', emptyRouteParams)
  const adminSettingsPath = resolve('/admin/settings', emptyRouteParams)

  interface MenuItem {
    icon: string
    title: string
    path: AdminNavPath
    requiredPermissions?: string[]
    children?: { title: string, path: AdminResolvedPath, requiredPermissions?: string[] }[]
  }

  const allMenuItems: MenuItem[] = $derived([
    { icon: 'icon-[tabler--layout-dashboard]', title: m.nav_dashboard(), path: '/admin' },
    {
      icon: 'icon-[tabler--shield-lock]',
      title: m.nav_iam(),
      path: '/admin/iam',
      requiredPermissions: ['user:read', 'role:read', 'permission:read'],
      children: [
        { title: m.nav_users(), path: '/admin/iam/users', requiredPermissions: ['user:read'] },
        { title: m.nav_roles(), path: '/admin/iam/roles', requiredPermissions: ['role:read'] },
        { title: m.nav_permissions(), path: '/admin/iam/permissions', requiredPermissions: ['permission:read'] },
      ],
    },
    { icon: 'icon-[tabler--components]', title: m.nav_ui_gallery(), path: '/admin/ui-gallery' },
    { icon: 'icon-[tabler--puzzle]', title: m.nav_modules(), path: '/admin/modules' },
    { icon: 'icon-[tabler--file-text]', title: m.nav_logs(), path: '/admin/logs', requiredPermissions: ['system:logs'] },
    { icon: 'icon-[tabler--settings]', title: m.nav_settings(), path: '/admin/settings' },
  ])

  const menuItems = $derived(
    allMenuItems
      .map((item) => {
        if (item.children) {
          const visibleChildren = item.children.filter(
            child => !child.requiredPermissions?.length || child.requiredPermissions.some(p => hasPerm(p)),
          )
          if (visibleChildren.length === 0)
            return null
          return { ...item, children: visibleChildren }
        }
        if (!item.requiredPermissions?.length || item.requiredPermissions.some(p => hasPerm(p))) {
          return item
        }
        return null
      })
      .filter((item): item is MenuItem => item !== null),
  )

  const expandedMenus = new SvelteSet<string>(['/admin/iam'])
  const currentPath = $derived(page.url.pathname)

  function isActive(path: string): boolean {
    if (path === '/admin')
      return currentPath === '/admin'
    return currentPath.startsWith(path)
  }

  function toggleSubmenu(event: MouseEvent, path: string) {
    event.preventDefault()
    event.stopPropagation()
    if (expandedMenus.has(path))
      expandedMenus.delete(path)
    else expandedMenus.add(path)
  }

  function toggleSidebar(event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    sidebarCollapsed = !sidebarCollapsed
  }

  function closeMobileMenu() {
    mobileMenuOpen = false
  }

  function toggleUserMenu(event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    userMenuOpen = !userMenuOpen
  }

  async function handleLogout() {
    userMenuOpen = false
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' })
    }
    catch {
    // 忽略
    }
    void goto(authLoginPath)
  }

  function handleDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement
    if (userMenuOpen && !target.closest('.user-menu-container')) {
      userMenuOpen = false
    }
  }
</script>

<svelte:document onclick={handleDocumentClick} />

<svelte:head>
  <title>{appName}</title>
</svelte:head>

<div class='flex h-screen bg-base-200/60'>
  <!-- 移动端菜单遮罩 -->
  {#if mobileMenuOpen}
    <BareButton
      type='button'
      class='fixed inset-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden'
      onclick={closeMobileMenu}
      ariaLabel={m.action_close()}
    />
  {/if}

  <!-- 侧边栏 -->
  <aside
    class="fixed lg:static top-0 left-0 z-50 h-full flex flex-col
      bg-base-100 border-r border-base-content/6
      transition-all duration-300 ease-out-expo
      {sidebarCollapsed ? 'w-17' : 'w-60'}
      {mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}"
  >
    <!-- Logo -->
    <div class='h-14 flex items-center gap-2.5 px-4 shrink-0 border-b border-base-content/6'>
      <div class='w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0'>
        <span class='text-primary-content font-bold text-sm'>h</span>
      </div>
      {#if !sidebarCollapsed}
        <div class='flex flex-col overflow-hidden'>
          <span class='text-sm font-semibold text-base-content truncate leading-tight'>{appName}</span>
          <span class='text-2xs text-base-content/40 leading-tight'>v{appVersion}</span>
        </div>
      {/if}
    </div>

    <!-- 导航 -->
    <nav class='flex-1 py-3 overflow-y-auto overflow-x-hidden'>
      <ul class='space-y-0.5 px-2'>
        {#each menuItems as item (item.path)}
          <li>
            {#if item.children}
              <BareButton
                type='button'
                class="flex items-center w-full rounded-lg px-2.5 py-2 text-left transition-colors duration-150
                  {isActive(item.path)
                    ? 'text-primary bg-primary/6'
                    : 'text-base-content/60 hover:bg-base-content/4 hover:text-base-content/80'}"
                onclick={(e: MouseEvent) => toggleSubmenu(e, item.path)}
              >
                <span class='{item.icon} size-4.5 shrink-0'></span>
                {#if !sidebarCollapsed}
                  <span class='ml-2.5 flex-1 text-[13px] font-medium'>{item.title}</span>
                  <span class="icon-[tabler--chevron-down] size-3.5 transition-transform duration-200 opacity-40
                    {expandedMenus.has(item.path) ? 'rotate-180' : ''}"></span>
                {/if}
              </BareButton>

              {#if !sidebarCollapsed && expandedMenus.has(item.path)}
                <ul class='mt-0.5 space-y-0.5 ml-4.5 pl-3 border-l border-base-content/8'>
                  {#each item.children as child (child.path)}
                    <li>
                      <a
                        href={resolve(child.path, emptyRouteParams)}
                        class="block rounded-md px-2.5 py-1.5 text-[13px] transition-colors duration-150
                          {currentPath === child.path
                            ? 'text-primary font-medium bg-primary/6'
                            : 'text-base-content/50 hover:text-base-content/70 hover:bg-base-content/4'}"
                        onclick={closeMobileMenu}
                      >
                        {child.title}
                      </a>
                    </li>
                  {/each}
                </ul>
              {/if}
            {:else}
              <a
                href={resolve(item.path as AdminResolvedPath, emptyRouteParams)}
                class="flex items-center rounded-lg px-2.5 py-2 transition-colors duration-150
                  {isActive(item.path)
                    ? 'text-primary bg-primary/6 font-medium'
                    : 'text-base-content/60 hover:bg-base-content/4 hover:text-base-content/80'}"
                onclick={closeMobileMenu}
              >
                <span class='{item.icon} size-4.5 shrink-0'></span>
                {#if !sidebarCollapsed}
                  <span class='ml-2.5 text-[13px] font-medium'>{item.title}</span>
                {/if}
              </a>
            {/if}
          </li>
        {/each}
      </ul>
    </nav>

    <!-- 侧边栏底部 -->
    <div class='p-2 shrink-0 border-t border-base-content/6'>
      <BareButton
        type='button'
        class='flex items-center w-full rounded-lg px-2.5 py-2 text-base-content/40 hover:bg-base-content/4 hover:text-base-content/60 transition-colors duration-150'
        onclick={toggleSidebar}
      >
        <span class="icon-[tabler--layout-sidebar-left-collapse] size-4.5 shrink-0 transition-transform duration-300
          {sidebarCollapsed ? 'rotate-180' : ''}"></span>
        {#if !sidebarCollapsed}
          <span class='ml-2.5 text-[13px] font-medium'>{m.nav_collapse()}</span>
        {/if}
      </BareButton>
    </div>
  </aside>

  <!-- 主内容区 -->
  <div class='flex-1 flex flex-col min-w-0 overflow-hidden'>
    <!-- 顶栏 -->
    <header class='h-14 bg-base-100 border-b border-base-content/6 shrink-0'>
      <div class='h-full flex items-center justify-between px-4 lg:px-5'>
        <div class='flex items-center gap-3'>
          <BareButton
            type='button'
            class='p-1.5 rounded-lg text-base-content/50 hover:bg-base-content/4 lg:hidden'
            onclick={() => mobileMenuOpen = !mobileMenuOpen}
            ariaLabel={m.action_open()}
          >
            <span class='icon-[tabler--menu-2] size-5'></span>
          </BareButton>

          <nav class='hidden sm:flex items-center gap-1 text-sm'>
            <a href={adminHomePath} class='text-base-content/40 hover:text-base-content/60 transition-colors'>{m.nav_home()}</a>
            <span class='text-base-content/20 mx-0.5'>/</span>
            <span class='text-base-content/80 font-medium'>
              {menuItems.find(item => isActive(item.path))?.title ?? m.nav_page()}
            </span>
          </nav>
        </div>

        <div class='flex items-center gap-2'>
          {#if data.appConfig?.env === 'development'}
            <span class='hidden sm:inline-flex items-center px-2 py-0.5 rounded-md text-2xs font-medium bg-amber-500/10 text-amber-600 border border-amber-500/15'>
              {m.common_dev_env()}
            </span>
          {/if}

          <!-- 主题快速切换 -->
          <ThemeToggle {currentTheme} onchange={handleThemeChange} />

          <!-- 用户菜单 -->
          <div class='relative user-menu-container'>
            <BareButton
              type='button'
              class='flex items-center gap-2 px-2 py-1.5 -mr-2 rounded-lg hover:bg-base-content/4 transition-colors duration-150'
              onclick={toggleUserMenu}
            >
              <Avatar
                name={data.user?.displayName || data.user?.username || 'Guest'}
                src={data.user?.avatarUrl}
                size='sm'
              />
              <span class='hidden sm:block text-[13px] font-medium text-base-content/80'>
                {data.user?.displayName || data.user?.username || 'Guest'}
              </span>
              <span class='icon-[tabler--chevron-down] size-3.5 text-base-content/30 hidden sm:block'></span>
            </BareButton>

            {#if userMenuOpen}
              <div class='absolute right-0 top-full mt-1.5 w-52 bg-base-100 rounded-xl border border-base-content/8 shadow-(--shadow-float) py-1 z-50 hai-scale-in origin-top-right'>
                <div class='px-3.5 py-2.5 border-b border-base-content/6'>
                  <p class='text-sm font-medium text-base-content leading-tight'>{data.user?.displayName || data.user?.username || 'Guest'}</p>
                  <p class='text-2xs text-base-content/40 mt-0.5'>@{data.user?.username ?? 'guest'}</p>
                  <p class='text-2xs text-base-content/40 mt-0.5'>{data.user?.roles?.join(', ') ?? m.common_guest()}</p>
                </div>
                <div class='py-0.5'>
                  <a
                    href={adminProfilePath}
                    class='flex items-center gap-2.5 px-3.5 py-2 text-[13px] text-base-content/60 hover:bg-base-content/4 hover:text-base-content/80 transition-colors'
                    onclick={() => { userMenuOpen = false }}
                  >
                    <span class='icon-[tabler--user] size-4'></span>
                    {m.nav_profile()}
                  </a>
                  <a
                    href={adminSettingsPath}
                    class='flex items-center gap-2.5 px-3.5 py-2 text-[13px] text-base-content/60 hover:bg-base-content/4 hover:text-base-content/80 transition-colors'
                    onclick={() => { userMenuOpen = false }}
                  >
                    <span class='icon-[tabler--settings] size-4'></span>
                    {m.nav_settings()}
                  </a>
                </div>
                <div class='border-t border-base-content/6 py-0.5'>
                  <Button
                    variant='ghost'
                    class='flex items-center gap-2.5 w-full justify-start text-error/70 hover:bg-error/6 hover:text-error text-[13px] px-3.5'
                    onclick={handleLogout}
                  >
                    <span class='icon-[tabler--logout] size-4'></span>
                    {m.nav_logout()}
                  </Button>
                </div>
              </div>
            {/if}
          </div>
        </div>
      </div>
    </header>

    <!-- 页面内容 -->
    <main class='flex-1 overflow-auto p-5 lg:p-6'>
      <div class='max-w-7xl mx-auto'>
        {@render children()}
      </div>
    </main>

    <!-- 页脚 -->
    <footer class='h-10 border-t border-base-content/6 flex items-center justify-center px-6 shrink-0'>
      <p class='text-2xs text-base-content/30 tracking-wide'>
        {appName} v{appVersion}
      </p>
    </footer>
  </div>
</div>
