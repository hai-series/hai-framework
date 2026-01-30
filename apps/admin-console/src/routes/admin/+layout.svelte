<!--
  hai Admin Console - 后台布局
  现代化侧边栏 + 顶栏布局，支持响应式和主题切换
-->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { LayoutData } from './$types'
  import { page } from '$app/stores'
  import { goto } from '$app/navigation'
  
  interface Props {
    data: LayoutData
    children: Snippet
  }
  
  let { data, children }: Props = $props()
  
  /** 侧边栏收起状态 */
  let sidebarCollapsed = $state(false)
  
  /** 移动端侧边栏打开状态 */
  let mobileMenuOpen = $state(false)
  
  /** 用户下拉菜单状态 */
  let userMenuOpen = $state(false)
  
  /** 主菜单配置 */
  const menuItems = [
    { icon: 'icon-[tabler--layout-dashboard]', title: '仪表盘', path: '/admin' },
    {
      icon: 'icon-[tabler--shield-lock]',
      title: '身份与访问',
      path: '/admin/iam',
      children: [
        { title: '用户管理', path: '/admin/iam/users' },
        { title: '角色管理', path: '/admin/iam/roles' },
        { title: '权限管理', path: '/admin/iam/permissions' },
      ],
    },
    {
      icon: 'icon-[tabler--database]',
      title: '数据服务',
      path: '/admin/services',
      children: [
        { title: '数据库', path: '/admin/services/database' },
        { title: '缓存', path: '/admin/services/cache' },
        { title: '存储', path: '/admin/services/storage' },
      ],
    },
    {
      icon: 'icon-[tabler--tools]',
      title: '开发工具',
      path: '/admin/tools',
      children: [
        { title: '加密工具', path: '/admin/tools/crypto' },
        { title: 'AI 助手', path: '/admin/tools/ai' },
      ],
    },
    { icon: 'icon-[tabler--components]', title: 'UI 组件库', path: '/admin/ui-gallery' },
    { icon: 'icon-[tabler--file-text]', title: '审计日志', path: '/admin/logs' },
    { icon: 'icon-[tabler--settings]', title: '系统设置', path: '/admin/settings' },
  ]
  
  /** 展开的子菜单 */
  let expandedMenus = $state<Set<string>>(new Set())
  
  /** 当前路径 */
  const currentPath = $derived($page.url.pathname)
  
  /** 检查是否为当前菜单 */
  function isActive(path: string): boolean {
    if (path === '/admin') {
      return currentPath === '/admin'
    }
    return currentPath.startsWith(path)
  }
  
  /** 切换子菜单展开状态 */
  function toggleSubmenu(path: string) {
    if (expandedMenus.has(path)) {
      expandedMenus.delete(path)
    } else {
      expandedMenus.add(path)
    }
    expandedMenus = new Set(expandedMenus)
  }
  
  /** 关闭移动端菜单 */
  function closeMobileMenu() {
    mobileMenuOpen = false
  }
  
  /** 处理登出 */
  async function handleLogout() {
    userMenuOpen = false
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch (e) {
      // 忽略错误
    }
    goto('/auth/login')
  }
  
  // 自动展开当前活动的子菜单
  $effect(() => {
    for (const item of menuItems) {
      if (item.children && isActive(item.path)) {
        expandedMenus.add(item.path)
      }
    }
    expandedMenus = new Set(expandedMenus)
  })
</script>

<svelte:head>
  <title>管理后台 - hai Admin</title>
</svelte:head>

<div class="min-h-screen bg-base-200/50">
  <!-- 移动端菜单遮罩 -->
  {#if mobileMenuOpen}
    <button
      type="button"
      class="fixed inset-0 z-40 bg-black/50 lg:hidden"
      onclick={closeMobileMenu}
      aria-label="关闭菜单"
    ></button>
  {/if}
  
  <!-- 侧边栏 -->
  <aside
    class="fixed top-0 left-0 z-50 h-screen bg-base-100 border-r border-base-content/10 shadow-sm
      transition-all duration-300 ease-in-out
      {sidebarCollapsed ? 'w-16' : 'w-64'}
      {mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}"
  >
    <!-- Logo 区域 -->
    <div class="h-16 flex items-center gap-3 px-4 border-b border-base-content/10">
      <div class="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
        <span class="text-primary font-bold text-xl">h</span>
      </div>
      {#if !sidebarCollapsed}
        <span class="text-lg font-semibold">hai Admin</span>
      {/if}
    </div>
    
    <!-- 导航菜单 -->
    <nav class="flex-1 py-4 overflow-y-auto">
      <ul class="menu menu-sm gap-1 px-2">
        {#each menuItems as item}
          <li>
            {#if item.children}
              <!-- 有子菜单的项 -->
              <button
                type="button"
                class="flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors w-full
                  {isActive(item.path)
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-base-content/70 hover:bg-base-200 hover:text-base-content'}"
                onclick={() => toggleSubmenu(item.path)}
              >
                <span class="flex items-center gap-3">
                  <span class="{item.icon} size-5 shrink-0"></span>
                  {#if !sidebarCollapsed}
                    <span>{item.title}</span>
                  {/if}
                </span>
                {#if !sidebarCollapsed}
                  <span class="icon-[tabler--chevron-down] size-4 transition-transform {expandedMenus.has(item.path) ? 'rotate-180' : ''}"></span>
                {/if}
              </button>
              
              <!-- 子菜单 -->
              {#if !sidebarCollapsed && expandedMenus.has(item.path)}
                <ul class="menu menu-sm mt-1 ml-4 pl-4 border-l border-base-content/10">
                  {#each item.children as child}
                    <li>
                      <a
                        href={child.path}
                        class="rounded-lg px-3 py-2 transition-colors
                          {isActive(child.path)
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
                class="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors
                  {isActive(item.path)
                    ? 'bg-primary text-primary-content font-medium'
                    : 'text-base-content/70 hover:bg-base-200 hover:text-base-content'}"
                onclick={closeMobileMenu}
              >
                <span class="{item.icon} size-5 shrink-0"></span>
                {#if !sidebarCollapsed}
                  <span>{item.title}</span>
                {/if}
              </a>
            {/if}
          </li>
        {/each}
      </ul>
    </nav>
    
    <!-- 侧边栏底部 -->
    <div class="p-4 border-t border-base-content/10">
      <button
        type="button"
        class="btn btn-ghost btn-sm w-full justify-start gap-2"
        onclick={() => sidebarCollapsed = !sidebarCollapsed}
        aria-label={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
      >
        <span class="icon-[tabler--layout-sidebar-left-collapse] size-5 {sidebarCollapsed ? 'rotate-180' : ''} transition-transform"></span>
        {#if !sidebarCollapsed}
          <span>收起菜单</span>
        {/if}
      </button>
    </div>
  </aside>
  
  <!-- 主内容区 -->
  <div
    class="transition-all duration-300 ease-in-out
      {sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'}"
  >
    <!-- 顶部导航 -->
    <header class="sticky top-0 z-30 h-16 bg-base-100/95 backdrop-blur border-b border-base-content/10">
      <div class="h-full flex items-center justify-between px-4 lg:px-6">
        <!-- 左侧：移动端菜单按钮 + 面包屑 -->
        <div class="flex items-center gap-4">
          <button
            type="button"
            class="btn btn-ghost btn-sm btn-square lg:hidden"
            onclick={() => mobileMenuOpen = !mobileMenuOpen}
            aria-label="打开菜单"
          >
            <span class="icon-[tabler--menu-2] size-5"></span>
          </button>
          
          <div class="hidden sm:flex items-center gap-2 text-sm text-base-content/60">
            <a href="/admin" class="hover:text-base-content transition-colors">首页</a>
            <span class="icon-[tabler--chevron-right] size-4"></span>
            <span class="text-base-content font-medium">
              {menuItems.find(item => isActive(item.path))?.title ?? '页面'}
            </span>
          </div>
        </div>
        
        <!-- 右侧：主题切换 + 用户菜单 -->
        <div class="flex items-center gap-2">
          <!-- 主题切换 -->
          <label class="swap swap-rotate btn btn-ghost btn-sm btn-circle">
            <input type="checkbox" class="theme-controller" value="dark" />
            <span class="swap-off icon-[tabler--sun] size-5"></span>
            <span class="swap-on icon-[tabler--moon] size-5"></span>
          </label>
          
          <!-- 用户菜单 -->
          <div class="dropdown dropdown-end">
            <button
              type="button"
              class="btn btn-ghost btn-sm gap-2"
              onclick={() => userMenuOpen = !userMenuOpen}
            >
              <div class="avatar placeholder">
                <div class="bg-primary text-primary-content rounded-full w-8">
                  <span class="text-sm">{(data.user?.username ?? 'G')[0].toUpperCase()}</span>
                </div>
              </div>
              <span class="hidden sm:inline">{data.user?.username ?? 'Guest'}</span>
              <span class="icon-[tabler--chevron-down] size-4"></span>
            </button>
            
            {#if userMenuOpen}
              <ul class="dropdown-content menu bg-base-100 rounded-box shadow-lg border border-base-content/10 w-52 mt-2 p-2 z-50">
                <li class="menu-title px-2 py-1 text-xs font-semibold text-base-content/50">
                  {data.user?.username ?? 'Guest'}
                </li>
                <li>
                  <a href="/admin/settings/profile" onclick={() => userMenuOpen = false}>
                    <span class="icon-[tabler--user] size-4"></span>
                    个人资料
                  </a>
                </li>
                <li>
                  <a href="/admin/settings" onclick={() => userMenuOpen = false}>
                    <span class="icon-[tabler--settings] size-4"></span>
                    系统设置
                  </a>
                </li>
                <div class="divider my-1"></div>
                <li>
                  <button type="button" onclick={handleLogout} class="text-error">
                    <span class="icon-[tabler--logout] size-4"></span>
                    退出登录
                  </button>
                </li>
              </ul>
            {/if}
          </div>
        </div>
      </div>
    </header>
    
    <!-- 页面内容 -->
    <main class="p-4 lg:p-6">
      {@render children()}
    </main>
  </div>
</div>
