<!--
  Admin Console - 仪表盘
-->
<script lang="ts">
  import type { PageData } from './$types'
  import { Badge } from '@h-ai/ui'
  import * as m from '$lib/paraglide/messages'
  import { getLocale } from '$lib/paraglide/runtime'

  interface Props {
    data: PageData
  }

  let { data }: Props = $props()

  function formatTime(isoString: string | Date): string {
    const date = new Date(isoString)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    
    if (diff < 60000) return m.time_just_now()
    if (diff < 3600000) return m.time_minutes_ago({ count: Math.floor(diff / 60000) })
    if (diff < 86400000) return m.time_hours_ago({ count: Math.floor(diff / 3600000) })
    
    const locale = getLocale()
    return date.toLocaleDateString(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

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

  const statCards = $derived([
    {
      label: m.dashboard_total_users(),
      value: data.stats.userCount,
      sub: m.dashboard_active_count({ count: data.stats.activeUsers }),
      icon: 'icon-[tabler--users]',
      color: 'text-primary',
      accent: 'bg-primary/8',
      bar: 'bg-primary',
    },
    {
      label: m.dashboard_total_roles(),
      value: data.stats.roleCount,
      sub: m.dashboard_role_desc(),
      icon: 'icon-[tabler--shield-check]',
      color: 'text-emerald-600',
      accent: 'bg-emerald-500/8',
      bar: 'bg-emerald-500',
    },
    {
      label: m.dashboard_total_permissions(),
      value: data.stats.permissionCount,
      sub: m.dashboard_permission_desc(),
      icon: 'icon-[tabler--key]',
      color: 'text-amber-600',
      accent: 'bg-amber-500/8',
      bar: 'bg-amber-500',
    },
    {
      label: m.dashboard_activity_7d(),
      value: data.auditStats.reduce((sum: number, s: { count: number }) => sum + s.count, 0),
      sub: m.dashboard_audit_logs(),
      icon: 'icon-[tabler--chart-bar]',
      color: 'text-sky-600',
      accent: 'bg-sky-500/8',
      bar: 'bg-sky-500',
    },
  ])

  const quickLinks = $derived([
    { href: '/admin/iam/users', icon: 'icon-[tabler--users]', label: m.nav_users(), color: 'text-primary' },
    { href: '/admin/iam/roles', icon: 'icon-[tabler--shield-check]', label: m.nav_roles(), color: 'text-emerald-600' },
    { href: '/admin/iam/permissions', icon: 'icon-[tabler--key]', label: m.nav_permissions(), color: 'text-amber-600' },
    { href: '/admin/logs', icon: 'icon-[tabler--file-text]', label: m.nav_logs(), color: 'text-sky-600' },
    { href: '/admin/ui-gallery', icon: 'icon-[tabler--components]', label: m.nav_ui_gallery(), color: 'text-violet-600' },
    { href: '/admin/settings', icon: 'icon-[tabler--settings]', label: m.nav_settings(), color: 'text-base-content/50' },
  ])
</script>

<svelte:head>
  <title>{m.dashboard_title()} - {data.appConfig?.name ?? m.app_title()}</title>
</svelte:head>

<div class="space-y-5">
  <!-- 页面标题 -->
  <div>
    <h1 class="text-xl font-semibold text-base-content tracking-tight">{m.dashboard_title()}</h1>
    <p class="text-sm text-base-content/45 mt-0.5">{m.dashboard_subtitle()}</p>
  </div>

  <!-- 统计卡片 -->
  <div class="grid gap-3 grid-cols-2 lg:grid-cols-4">
    {#each statCards as card}
      <div class="relative bg-base-100 rounded-xl border border-base-content/6 p-4 overflow-hidden group hover:-translate-y-0.5 hover:shadow-(--shadow-soft) transition-all duration-200">
        <!-- 左侧色条 -->
        <div class="absolute left-0 top-3 bottom-3 w-0.75 rounded-full {card.bar} opacity-60"></div>
        <div class="flex items-start justify-between pl-2.5">
          <div class="min-w-0">
            <p class="text-xs font-medium text-base-content/50 truncate">{card.label}</p>
            <p class="text-2xl font-bold {card.color} mt-1 tabular-nums tracking-tight">{card.value}</p>
            <p class="text-2xs text-base-content/35 mt-0.5 truncate">{card.sub}</p>
          </div>
          <div class="w-9 h-9 rounded-lg {card.accent} flex items-center justify-center shrink-0">
            <span class="{card.icon} size-4.5 {card.color}"></span>
          </div>
        </div>
      </div>
    {/each}
  </div>

  <!-- 内容区 -->
  <div class="grid gap-4 lg:grid-cols-3">
    <!-- 快速入口 -->
    <div class="bg-base-100 rounded-xl border border-base-content/6 p-4">
      <div class="flex items-center gap-2 mb-3">
        <span class="icon-[tabler--rocket] size-4 text-base-content/40"></span>
        <h2 class="text-sm font-semibold text-base-content">{m.dashboard_quick_actions()}</h2>
      </div>
      <div class="grid grid-cols-2 gap-1">
        {#each quickLinks as link}
          <a href={link.href} class="flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-base-content/4 transition-colors duration-150 group">
            <span class="{link.icon} size-4 {link.color} opacity-70 group-hover:opacity-100 transition-opacity"></span>
            <span class="text-[13px] text-base-content/70 group-hover:text-base-content/90 transition-colors">{link.label}</span>
          </a>
        {/each}
      </div>
    </div>

    <!-- 最近活动 -->
    <div class="lg:col-span-2">
      <div class="bg-base-100 rounded-xl border border-base-content/6 p-4">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <span class="icon-[tabler--activity] size-4 text-base-content/40"></span>
            <h2 class="text-sm font-semibold text-base-content">{m.dashboard_recent_activity()}</h2>
          </div>
          <a href="/admin/logs" class="text-xs text-primary/70 hover:text-primary font-medium flex items-center gap-0.5 transition-colors">
            {m.action_view_all()}
            <span class="icon-[tabler--arrow-right] size-3.5"></span>
          </a>
        </div>

        <div class="divide-y divide-base-content/5">
          {#each data.recentActivity as activity}
            <div class="flex items-start gap-2.5 py-2.5 first:pt-0 last:pb-0">
              <div class="shrink-0 w-7 h-7 rounded-full bg-base-content/5 flex items-center justify-center mt-0.5">
                <span class="icon-[tabler--user] size-3.5 text-base-content/40"></span>
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="text-[13px] font-medium text-base-content">{activity.username ?? m.common_unknown_user()}</span>
                  <Badge variant={getActivityBadgeVariant(activity.action)} size="sm">
                    {translateAction(activity.action)}
                  </Badge>
                  <span class="text-base-content/45 text-xs">{activity.resource}</span>
                </div>
                {#if activity.details}
                  <p class="text-xs text-base-content/35 truncate mt-0.5">{activity.details}</p>
                {/if}
              </div>
              <div class="text-2xs text-base-content/30 whitespace-nowrap tabular-nums shrink-0">
                {formatTime(activity.createdAt)}
              </div>
            </div>
          {:else}
            <div class="py-8 text-center text-sm text-base-content/30">
              {m.common_no_activity()}
            </div>
          {/each}
        </div>
      </div>
    </div>
  </div>

  <!-- 活动统计 -->
  {#if data.auditStats.length > 0}
    <div class="bg-base-100 rounded-xl border border-base-content/6 p-4">
      <div class="flex items-center gap-2 mb-3">
        <span class="icon-[tabler--chart-bar] size-4 text-base-content/40"></span>
        <h2 class="text-sm font-semibold text-base-content">{m.dashboard_activity_stats()}</h2>
      </div>
      <div class="flex flex-wrap gap-2">
        {#each data.auditStats as stat}
          <div class="flex items-center gap-2 px-3 py-1.5 bg-base-content/3 rounded-lg border border-base-content/6">
            <Badge variant={getActivityBadgeVariant(stat.action)} size="sm">
              {translateAction(stat.action)}
            </Badge>
            <span class="text-sm font-semibold text-base-content tabular-nums">{stat.count}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>
