<!--
  hai Admin Console - 后台布局
  现代化扁平设计，侧边栏 + 顶栏布局
-->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { LayoutData } from './$types'
  import { page } from '$app/state'
  import { goto } from '$app/navigation'
  import * as m from '$lib/paraglide/messages'
  import { apiFetch } from '$lib/utils/api'
  
  interface Props {
    data: LayoutData
    children: Snippet
  }
  
  let { data, children }: Props = $props()
  
  // 从配置获取应用信息
  const appName = $derived(data.appConfig?.name ?? m.app_title())
  const appVersion = $derived(data.appConfig?.version ?? '0.1.0')

  /** 用户权限列表 */
  const userPermissions = $derived(data.user?.permissions ?? [])

  /**
   * 检查当前用户是否具有指定权限。
   * 支持通配符（`admin:*` 匹配 `admin:read` 等）。
   */
  function hasPerm(permission: string): boolean {
    for (const p of userPermissions) {
      if (p === permission || p === '*') return true
      if (p.endsWith(':*') && permission.startsWith(p.slice(0, -1))) return true
    }
    return false
  }
  
  /** 侧边栏收起状态 */
  let sidebarCollapsed = $state(false)
  
  /** 移动端侧边栏打开状态 */
  let mobileMenuOpen = $state(false)
  
  /** 用户下拉菜单状态 */
  let userMenuOpen = $state(false)
  
  // 图标 SVG 映射
  const icons: Record<string, string> = {
    dashboard: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
      <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </svg>`,
    shield: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
      <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>`,
    grid: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
      <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </svg>`,
    file: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
      <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>`,
    modules: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
      <path stroke-linecap="round" stroke-linejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
    </svg>`,
    settings: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
      <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>`,
  }

  /** 菜单项类型 */
  interface MenuItem {
    icon: string
    title: string
    path: string
    /** 访问此菜单需要的权限（满足任一即可；为空表示无需特殊权限） */
    requiredPermissions?: string[]
    children?: { title: string, path: string, requiredPermissions?: string[] }[]
  }

  /** 全部菜单配置（使用 $derived 响应语言切换） */
  const allMenuItems: MenuItem[] = $derived([
    { icon: 'dashboard', title: m.nav_dashboard(), path: '/admin' },
    {
      icon: 'shield',
      title: m.nav_iam(),
      path: '/admin/iam',
      requiredPermissions: ['user:read', 'role:read', 'permission:read'],
      children: [
        { title: m.nav_users(), path: '/admin/iam/users', requiredPermissions: ['user:read'] },
        { title: m.nav_roles(), path: '/admin/iam/roles', requiredPermissions: ['role:read'] },
        { title: m.nav_permissions(), path: '/admin/iam/permissions', requiredPermissions: ['permission:read'] },
      ],
    },
    { icon: 'grid', title: m.nav_ui_gallery(), path: '/admin/ui-gallery' },
    { icon: 'modules', title: m.nav_modules(), path: '/admin/modules' },
    { icon: 'file', title: m.nav_logs(), path: '/admin/logs', requiredPermissions: ['system:logs'] },
    { icon: 'settings', title: m.nav_settings(), path: '/admin/settings', requiredPermissions: ['system:settings'] },
  ])

  /**
   * 经权限过滤后的菜单。
   * - 无 requiredPermissions 的菜单项始终可见
   * - 有 requiredPermissions 的菜单项需满足任一权限
   * - 父菜单自动隐藏当所有子项都不可见时
   */
  const menuItems = $derived(
    allMenuItems
      .map((item) => {
        // 过滤子菜单
        if (item.children) {
          const visibleChildren = item.children.filter(
            child => !child.requiredPermissions?.length || child.requiredPermissions.some(p => hasPerm(p)),
          )
          // 无可见子菜单 → 隐藏父菜单
          if (visibleChildren.length === 0) return null
          return { ...item, children: visibleChildren }
        }
        // 无需权限或有权限 → 可见
        if (!item.requiredPermissions?.length || item.requiredPermissions.some(p => hasPerm(p))) {
          return item
        }
        return null
      })
      .filter((item): item is MenuItem => item !== null),
  )
  
  /** 展开的子菜单 */
  let expandedMenus = $state<Set<string>>(new Set(['/admin/iam']))
  
  /** 当前路径 */
  const currentPath = $derived(page.url.pathname)
  
  /** 检查是否为当前菜单 */
  function isActive(path: string): boolean {
    if (path === '/admin') return currentPath === '/admin'
    return currentPath.startsWith(path)
  }
  
  /** 切换子菜单展开状态 */
  function toggleSubmenu(event: MouseEvent, path: string) {
    event.preventDefault()
    event.stopPropagation()
    const newSet = new Set(expandedMenus)
    if (newSet.has(path)) {
      newSet.delete(path)
    } else {
      newSet.add(path)
    }
    expandedMenus = newSet
  }
  
  /** 切换侧边栏收起状态 */
  function toggleSidebar(event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    sidebarCollapsed = !sidebarCollapsed
  }
  
  /** 关闭移动端菜单 */
  function closeMobileMenu() {
    mobileMenuOpen = false
  }
  
  /** 切换用户菜单 */
  function toggleUserMenu(event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    userMenuOpen = !userMenuOpen
  }
  
  /** 处理登出 */
  async function handleLogout() {
    userMenuOpen = false
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // 忽略错误
    }
    goto('/auth/login')
  }

  /** 点击外部关闭用户菜单 */
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

<div class="flex h-screen bg-base-200">
  <!-- 移动端菜单遮罩 -->
  {#if mobileMenuOpen}
    <BareButton
      type="button"
      class="fixed inset-0 z-40 bg-black/30 lg:hidden"
      onclick={closeMobileMenu}
      ariaLabel={m.action_close()}
    />
  {/if}
  
  <!-- 侧边栏 -->
  <aside
    class="fixed lg:static top-0 left-0 z-50 h-full flex flex-col bg-base-100
      transition-all duration-300 ease-out
      {sidebarCollapsed ? 'w-18' : 'w-65'}
      {mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}"
  >
    <!-- Logo 区域 -->
    <div class="h-16 flex items-center gap-3 px-4 shrink-0">
      <div class="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0">
        <span class="text-primary-content font-bold text-lg">h</span>
      </div>
      {#if !sidebarCollapsed}
        <div class="flex flex-col overflow-hidden">
          <span class="text-base font-semibold text-base-content truncate">{appName}</span>
          <span class="text-xs text-base-content/50">v{appVersion}</span>
        </div>
      {/if}
    </div>
    
    <!-- 导航菜单 -->
    <nav class="flex-1 py-4 overflow-y-auto overflow-x-hidden">
      <ul class="space-y-1 px-3">
        {#each menuItems as item}
          <li>
            {#if item.children}
              <!-- 有子菜单的项 -->
              <BareButton
                type="button"
                class="flex items-center w-full rounded-lg px-3 py-2.5 text-left transition-colors
                  {isActive(item.path)
                    ? 'bg-primary/10 text-primary'
                    : 'text-base-content/70 hover:bg-base-200 hover:text-base-content'}"
                onclick={(e: MouseEvent) => toggleSubmenu(e, item.path)}
              >
                <span class="w-5 h-5 shrink-0">
                  {@html icons[item.icon] ?? ''}
                </span>
                {#if !sidebarCollapsed}
                  <span class="ml-3 flex-1 font-medium text-sm">{item.title}</span>
                  <svg 
                    class="w-4 h-4 transition-transform duration-200 {expandedMenus.has(item.path) ? 'rotate-180' : ''}" 
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                  </svg>
                {/if}
              </BareButton>
              
              <!-- 子菜单 -->
              {#if !sidebarCollapsed && expandedMenus.has(item.path)}
                <ul class="mt-1 space-y-1 pl-11">
                  {#each item.children as child}
                    <li>
                      <a
                        href={child.path}
                        class="block rounded-lg px-3 py-2 text-sm transition-colors
                          {currentPath === child.path
                            ? 'bg-primary text-primary-content font-medium'
                            : 'text-base-content/60 hover:bg-base-200 hover:text-base-content'}"
                        onclick={closeMobileMenu}
                      >
                        {child.title}
                      </a>
                    </li>
                  {/each}
                </ul>
              {/if}
            {:else}
              <!-- 无子菜单的项 -->
              <a
                href={item.path}
                class="flex items-center rounded-lg px-3 py-2.5 transition-colors
                  {isActive(item.path)
                    ? 'bg-primary text-primary-content'
                    : 'text-base-content/70 hover:bg-base-200 hover:text-base-content'}"
                onclick={closeMobileMenu}
              >
                <span class="w-5 h-5 shrink-0">
                  {@html icons[item.icon] ?? ''}
                </span>
                {#if !sidebarCollapsed}
                  <span class="ml-3 font-medium text-sm">{item.title}</span>
                {/if}
              </a>
            {/if}
          </li>
        {/each}
      </ul>
    </nav>
    
    <!-- 侧边栏底部 -->
    <div class="p-3 shrink-0">
      <BareButton
        type="button"
        class="flex items-center w-full rounded-lg px-3 py-2.5 text-base-content/60 hover:bg-base-200 hover:text-base-content transition-colors"
        onclick={toggleSidebar}
      >
        <svg 
          class="w-5 h-5 shrink-0 transition-transform duration-300 {sidebarCollapsed ? 'rotate-180' : ''}" 
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
        </svg>
        {#if !sidebarCollapsed}
          <span class="ml-3 text-sm font-medium">{m.nav_collapse()}</span>
        {/if}
      </BareButton>
    </div>
  </aside>
  
  <!-- 主内容区 -->
  <div class="flex-1 flex flex-col min-w-0 overflow-hidden">
    <!-- 顶部导航 -->
    <header class="h-16 bg-base-100 shadow-sm shrink-0">
      <div class="h-full flex items-center justify-between px-4 lg:px-6">
        <!-- 左侧：移动端菜单按钮 + 面包屑 -->
        <div class="flex items-center gap-4">
          <BareButton
            type="button"
            class="p-2 rounded-lg text-base-content/60 hover:bg-base-200 lg:hidden"
            onclick={() => mobileMenuOpen = !mobileMenuOpen}
            ariaLabel={m.action_open()}
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </BareButton>
          
          <nav class="hidden sm:flex items-center gap-2 text-sm">
            <a href="/admin" class="text-base-content/50 hover:text-base-content/70">{m.nav_home()}</a>
            <svg class="w-4 h-4 text-base-content/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
            <span class="text-base-content font-medium">
              {menuItems.find(item => isActive(item.path))?.title ?? m.nav_page()}
            </span>
          </nav>
        </div>
        
        <!-- 右侧：用户菜单 -->
        <div class="flex items-center gap-3">
          <!-- 环境标识 -->
          {#if data.appConfig?.env === 'development'}
            <span class="hidden sm:inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-amber-100 text-amber-700">
              {m.common_dev_env()}
            </span>
          {/if}
          
          <!-- 用户菜单 -->
          <div class="relative user-menu-container">
            <BareButton
              type="button"
              class="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-base-200 transition-colors"
              onclick={toggleUserMenu}
            >
              <Avatar 
                name={data.user?.displayName || data.user?.username || 'Guest'}
                src={data.user?.avatarUrl}
                size="sm"
              />
              <span class="hidden sm:block text-sm font-medium text-base-content">
                {data.user?.displayName || data.user?.username || 'Guest'}
              </span>
              <svg class="w-4 h-4 text-base-content/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </BareButton>
            
            {#if userMenuOpen}
              <div class="absolute right-0 top-full mt-2 w-56 bg-base-100 rounded-xl shadow-lg py-1 z-50">
                <div class="px-4 py-3 border-b border-base-content/5">
                  <p class="text-sm font-medium text-base-content">{data.user?.displayName || data.user?.username || 'Guest'}</p>
                  <p class="text-xs text-base-content/50 mt-0.5">@{data.user?.username ?? 'guest'}</p>
                  <p class="text-xs text-base-content/60 mt-0.5">{data.user?.roles?.join(', ') ?? m.common_guest()}</p>
                </div>
                <div class="py-1">
                  <a
                    href="/admin/profile"
                    class="flex items-center gap-3 px-4 py-2 text-sm text-base-content/70 hover:bg-base-200"
                    onclick={(e: MouseEvent) => { userMenuOpen = false }}
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    {m.nav_profile()}
                  </a>
                  <a
                    href="/admin/settings"
                    class="flex items-center gap-3 px-4 py-2 text-sm text-base-content/70 hover:bg-base-200"
                    onclick={(e: MouseEvent) => { userMenuOpen = false }}
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {m.nav_settings()}
                  </a>
                </div>
                <div class="border-t border-base-content/5 py-1">
                  <Button
                    variant="ghost"
                    class="flex items-center gap-3 w-full justify-start text-error hover:bg-error/10"
                    onclick={handleLogout}
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
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
    <main class="flex-1 overflow-auto p-6 bg-base-200">
      {@render children()}
    </main>
    
    <!-- 页脚 -->
    <footer class="h-12 bg-base-100 flex items-center justify-center px-6 shrink-0">
      <p class="text-xs text-base-content/50">
        {appName} v{appVersion}
      </p>
    </footer>
  </div>
</div>
