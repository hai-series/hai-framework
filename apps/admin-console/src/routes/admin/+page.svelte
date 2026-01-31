<!--
  Admin Console - 仪表盘
  现代化设计，使用内联 SVG 图标
-->
<script lang="ts">
  import type { PageData } from './$types'
  import { Card, Badge } from '@hai/ui'
  import * as m from '$lib/paraglide/messages'
  import { getLocale } from '$lib/paraglide/runtime'

  interface Props {
    data: PageData
  }

  let { data }: Props = $props()

  /** 格式化时间（响应式 i18n） */
  function formatTime(isoString: string): string {
    const date = new Date(isoString)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    
    if (diff < 60000) return m.time_just_now()
    if (diff < 3600000) return m.time_minutes_ago({ count: Math.floor(diff / 60000) })
    if (diff < 86400000) return m.time_hours_ago({ count: Math.floor(diff / 3600000) })
    
    const locale = getLocale()
    return date.toLocaleDateString(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  /** 翻译活动动作（使用 i18n） */
  function translateAction(action: string): string {
    const translations: Record<string, () => string> = {
      login: m.activity_login,
      logout: m.activity_logout,
      register: m.activity_register,
      create: m.activity_create,
      update: m.activity_update,
      delete: m.activity_delete,
      password_reset: m.activity_password_reset,
    }
    const fn = translations[action]
    return fn ? fn() : action
  }
  
  /** 获取活动颜色类 */
  function getActivityBadgeVariant(action: string): 'success' | 'warning' | 'error' | 'primary' | 'info' {
    switch (action) {
      case 'login':
      case 'register':
        return 'success'
      case 'logout':
        return 'warning'
      case 'delete':
        return 'error'
      case 'create':
        return 'primary'
      default:
        return 'info'
    }
  }
</script>

<svelte:head>
  <title>{m.dashboard_title()} - {data.appConfig?.name ?? 'Admin Console'}</title>
</svelte:head>

<div class="space-y-6">
  <!-- 页面标题 -->
  <div class="mb-2">
    <h1 class="text-2xl font-bold text-base-content">{m.dashboard_title()}</h1>
    <p class="text-base-content/60 mt-1">{m.dashboard_subtitle()}</p>
  </div>

  <!-- 统计卡片 -->
  <div class="grid gap-4 grid-cols-2 lg:grid-cols-4">
    <!-- 用户总数 -->
    <div class="bg-base-100 rounded-xl border border-base-content/10 p-5">
      <div class="flex items-start justify-between">
        <div>
          <p class="text-sm font-medium text-base-content/60">{m.dashboard_total_users()}</p>
          <p class="text-3xl font-bold text-primary mt-1">{data.stats.userCount}</p>
          <p class="text-xs text-base-content/40 mt-1">{m.dashboard_active_count({ count: data.stats.activeUsers })}</p>
        </div>
        <div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <svg class="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
          </svg>
        </div>
      </div>
    </div>

    <!-- 角色数 -->
    <div class="bg-base-100 rounded-xl border border-base-content/10 p-5">
      <div class="flex items-start justify-between">
        <div>
          <p class="text-sm font-medium text-base-content/60">{m.dashboard_total_roles()}</p>
          <p class="text-3xl font-bold text-success mt-1">{data.stats.roleCount}</p>
          <p class="text-xs text-base-content/40 mt-1">{m.dashboard_role_desc()}</p>
        </div>
        <div class="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
          <svg class="w-5 h-5 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
        </div>
      </div>
    </div>

    <!-- 权限数 -->
    <div class="bg-base-100 rounded-xl border border-base-content/10 p-5">
      <div class="flex items-start justify-between">
        <div>
          <p class="text-sm font-medium text-base-content/60">{m.dashboard_total_permissions()}</p>
          <p class="text-3xl font-bold text-warning mt-1">{data.stats.permissionCount}</p>
          <p class="text-xs text-base-content/40 mt-1">{m.dashboard_permission_desc()}</p>
        </div>
        <div class="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
          <svg class="w-5 h-5 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
          </svg>
        </div>
      </div>
    </div>

    <!-- 近7日活动 -->
    <div class="bg-base-100 rounded-xl border border-base-content/10 p-5">
      <div class="flex items-start justify-between">
        <div>
          <p class="text-sm font-medium text-base-content/60">{m.dashboard_activity_7d()}</p>
          <p class="text-3xl font-bold text-info mt-1">
            {data.auditStats.reduce((sum, s) => sum + s.count, 0)}
          </p>
          <p class="text-xs text-base-content/40 mt-1">{m.dashboard_audit_logs()}</p>
        </div>
        <div class="w-10 h-10 rounded-lg bg-info/10 flex items-center justify-center">
          <svg class="w-5 h-5 text-info" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
          </svg>
        </div>
      </div>
    </div>
  </div>

  <!-- 内容区 -->
  <div class="grid gap-6 lg:grid-cols-3">
    <!-- 快速入口 -->
    <Card>
      <div class="flex items-center gap-2 mb-4">
        <svg class="w-5 h-5 text-base-content/60" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
        </svg>
        <h2 class="text-lg font-semibold text-base-content">{m.dashboard_quick_actions()}</h2>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <a href="/admin/iam/users" class="flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-base-200 transition-colors">
          <svg class="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
          </svg>
          <span class="text-sm text-base-content">{m.nav_users()}</span>
        </a>
        <a href="/admin/iam/roles" class="flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-base-200 transition-colors">
          <svg class="w-4 h-4 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
          <span class="text-sm text-base-content">{m.nav_roles()}</span>
        </a>
        <a href="/admin/iam/permissions" class="flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-base-200 transition-colors">
          <svg class="w-4 h-4 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
          </svg>
          <span class="text-sm text-base-content">{m.nav_permissions()}</span>
        </a>
        <a href="/admin/logs" class="flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-base-200 transition-colors">
          <svg class="w-4 h-4 text-info" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          <span class="text-sm text-base-content">{m.nav_logs()}</span>
        </a>
        <a href="/admin/ui-gallery" class="flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-base-200 transition-colors">
          <svg class="w-4 h-4 text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
          </svg>
          <span class="text-sm text-base-content">{m.nav_ui_gallery()}</span>
        </a>
        <a href="/admin/settings" class="flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-base-200 transition-colors">
          <svg class="w-4 h-4 text-base-content/60" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span class="text-sm text-base-content">{m.nav_settings()}</span>
        </a>
      </div>
    </Card>

    <!-- 最近活动 -->
    <div class="lg:col-span-2">
      <Card>
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2">
            <svg class="w-5 h-5 text-base-content/60" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
            </svg>
            <h2 class="text-lg font-semibold text-base-content">{m.dashboard_recent_activity()}</h2>
          </div>
          <a href="/admin/logs" class="text-sm text-primary hover:text-primary/80 font-medium flex items-center gap-1">
            {m.action_view_all()}
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </a>
        </div>

        <div class="divide-y divide-base-content/10">
          {#each data.recentActivity as activity}
            <div class="flex items-start gap-3 py-3">
              <div class="flex-shrink-0 w-8 h-8 rounded-full bg-base-200 flex items-center justify-center">
                <svg class="w-4 h-4 text-base-content/60" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="font-medium text-base-content">{activity.username ?? m.common_unknown_user()}</span>
                  <Badge variant={getActivityBadgeVariant(activity.action)} size="sm">
                    {translateAction(activity.action)}
                  </Badge>
                  <span class="text-base-content/60 text-sm">{activity.resource}</span>
                </div>
                {#if activity.details}
                  <p class="text-sm text-base-content/40 truncate mt-0.5">
                    {activity.details}
                  </p>
                {/if}
              </div>
              <div class="text-xs text-base-content/40 whitespace-nowrap">
                {formatTime(activity.created_at)}
              </div>
            </div>
          {:else}
            <div class="py-8 text-center text-base-content/40">
              {m.common_no_activity()}
            </div>
          {/each}
        </div>
      </Card>
    </div>
  </div>

  <!-- 活动统计 -->
  {#if data.auditStats.length > 0}
    <Card>
      <div class="flex items-center gap-2 mb-4">
        <svg class="w-5 h-5 text-base-content/60" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
        <h2 class="text-lg font-semibold text-base-content">{m.dashboard_activity_stats()}</h2>
      </div>
      <div class="flex flex-wrap gap-3">
        {#each data.auditStats as stat}
          <div class="flex items-center gap-2 px-4 py-2 bg-base-200 rounded-lg">
            <Badge variant={getActivityBadgeVariant(stat.action)}>
              {translateAction(stat.action)}
            </Badge>
            <span class="text-lg font-semibold text-base-content">{stat.count}</span>
          </div>
        {/each}
      </div>
    </Card>
  {/if}
</div>
