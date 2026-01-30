<!--
  =============================================================================
  Admin Console - 仪表盘
  =============================================================================
-->
<script lang="ts">
  import type { PageData } from './$types'

  interface Props {
    data: PageData
  }

  let { data }: Props = $props()

  /** 获取活动图标 */
  function getActivityIcon(action: string): string {
    switch (action) {
      case 'login':
        return 'icon-[tabler--login]'
      case 'logout':
        return 'icon-[tabler--logout]'
      case 'register':
        return 'icon-[tabler--user-plus]'
      case 'create':
        return 'icon-[tabler--plus]'
      case 'update':
        return 'icon-[tabler--edit]'
      case 'delete':
        return 'icon-[tabler--trash]'
      case 'password_reset':
      case 'password_reset_request':
        return 'icon-[tabler--key]'
      default:
        return 'icon-[tabler--activity]'
    }
  }

  /** 获取活动颜色 */
  function getActivityColor(action: string): string {
    switch (action) {
      case 'login':
      case 'register':
        return 'text-success'
      case 'logout':
        return 'text-warning'
      case 'delete':
        return 'text-error'
      case 'create':
        return 'text-primary'
      default:
        return 'text-base-content/60'
    }
  }

  /** 格式化时间 */
  function formatTime(isoString: string): string {
    const date = new Date(isoString)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    
    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
    
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  /** 翻译活动动作 */
  function translateAction(action: string): string {
    const translations: Record<string, string> = {
      login: '登录',
      logout: '登出',
      register: '注册',
      create: '创建',
      read: '查看',
      update: '更新',
      delete: '删除',
      password_reset: '重置密码',
      password_reset_request: '请求重置密码',
    }
    return translations[action] ?? action
  }
</script>

<svelte:head>
  <title>仪表盘 - Admin Console</title>
</svelte:head>

<div class="space-y-6">
  <!-- 页面标题 -->
  <div>
    <h1 class="text-2xl font-bold">仪表盘</h1>
    <p class="text-base-content/60 mt-1">系统概览与快速入口</p>
  </div>

  <!-- 统计卡片 -->
  <div class="grid gap-4 grid-cols-2 lg:grid-cols-4">
    <div class="stat bg-base-100 rounded-lg shadow-sm">
      <div class="stat-figure text-primary">
        <span class="icon-[tabler--users] size-8"></span>
      </div>
      <div class="stat-title">用户总数</div>
      <div class="stat-value text-primary">{data.stats.userCount}</div>
      <div class="stat-desc">活跃 {data.stats.activeUsers} 人</div>
    </div>

    <div class="stat bg-base-100 rounded-lg shadow-sm">
      <div class="stat-figure text-secondary">
        <span class="icon-[tabler--shield] size-8"></span>
      </div>
      <div class="stat-title">角色数</div>
      <div class="stat-value text-secondary">{data.stats.roleCount}</div>
      <div class="stat-desc">权限分组</div>
    </div>

    <div class="stat bg-base-100 rounded-lg shadow-sm">
      <div class="stat-figure text-accent">
        <span class="icon-[tabler--key] size-8"></span>
      </div>
      <div class="stat-title">权限数</div>
      <div class="stat-value text-accent">{data.stats.permissionCount}</div>
      <div class="stat-desc">细粒度控制</div>
    </div>

    <div class="stat bg-base-100 rounded-lg shadow-sm">
      <div class="stat-figure text-info">
        <span class="icon-[tabler--activity] size-8"></span>
      </div>
      <div class="stat-title">近7日活动</div>
      <div class="stat-value text-info">
        {data.auditStats.reduce((sum, s) => sum + s.count, 0)}
      </div>
      <div class="stat-desc">审计日志</div>
    </div>
  </div>

  <!-- 内容区 -->
  <div class="grid gap-6 lg:grid-cols-3">
    <!-- 快速入口 -->
    <div class="card bg-base-100 shadow-sm lg:col-span-1">
      <div class="card-body">
        <h2 class="card-title">
          <span class="icon-[tabler--rocket] size-5"></span>
          快速入口
        </h2>
        <div class="grid grid-cols-2 gap-2 mt-2">
          <a href="/admin/iam/users" class="btn btn-ghost justify-start gap-2">
            <span class="icon-[tabler--users] size-5 text-primary"></span>
            用户管理
          </a>
          <a href="/admin/iam/roles" class="btn btn-ghost justify-start gap-2">
            <span class="icon-[tabler--shield] size-5 text-secondary"></span>
            角色管理
          </a>
          <a href="/admin/iam/permissions" class="btn btn-ghost justify-start gap-2">
            <span class="icon-[tabler--key] size-5 text-accent"></span>
            权限管理
          </a>
          <a href="/admin/logs" class="btn btn-ghost justify-start gap-2">
            <span class="icon-[tabler--file-text] size-5 text-info"></span>
            审计日志
          </a>
          <a href="/admin/services/database" class="btn btn-ghost justify-start gap-2">
            <span class="icon-[tabler--database] size-5 text-warning"></span>
            数据库
          </a>
          <a href="/admin/services/cache" class="btn btn-ghost justify-start gap-2">
            <span class="icon-[tabler--server] size-5 text-error"></span>
            缓存
          </a>
          <a href="/admin/services/storage" class="btn btn-ghost justify-start gap-2">
            <span class="icon-[tabler--folder] size-5 text-success"></span>
            存储
          </a>
          <a href="/admin/tools/crypto" class="btn btn-ghost justify-start gap-2">
            <span class="icon-[tabler--lock] size-5"></span>
            加密工具
          </a>
        </div>
      </div>
    </div>

    <!-- 最近活动 -->
    <div class="card bg-base-100 shadow-sm lg:col-span-2">
      <div class="card-body">
        <div class="flex items-center justify-between">
          <h2 class="card-title">
            <span class="icon-[tabler--activity] size-5"></span>
            最近活动
          </h2>
          <a href="/admin/logs" class="btn btn-ghost btn-sm">
            查看全部
            <span class="icon-[tabler--arrow-right] size-4"></span>
          </a>
        </div>

        <div class="divide-y divide-base-content/10 mt-2">
          {#each data.recentActivity as activity}
            <div class="flex items-start gap-3 py-3">
              <div class="flex-shrink-0 w-8 h-8 rounded-full bg-base-200 flex items-center justify-center {getActivityColor(activity.action)}">
                <span class="{getActivityIcon(activity.action)} size-4"></span>
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="font-medium">{activity.username ?? '未知用户'}</span>
                  <span class="text-base-content/60">{translateAction(activity.action)}</span>
                  <span class="badge badge-ghost badge-sm">{activity.resource}</span>
                </div>
                {#if activity.details}
                  <p class="text-sm text-base-content/50 truncate">
                    {activity.details}
                  </p>
                {/if}
              </div>
              <div class="text-sm text-base-content/50 whitespace-nowrap">
                {formatTime(activity.created_at)}
              </div>
            </div>
          {:else}
            <div class="py-8 text-center text-base-content/50">
              暂无活动记录
            </div>
          {/each}
        </div>
      </div>
    </div>
  </div>

  <!-- 活动统计 -->
  {#if data.auditStats.length > 0}
    <div class="card bg-base-100 shadow-sm">
      <div class="card-body">
        <h2 class="card-title">
          <span class="icon-[tabler--chart-bar] size-5"></span>
          近7日活动统计
        </h2>
        <div class="flex flex-wrap gap-4 mt-4">
          {#each data.auditStats as stat}
            <div class="flex items-center gap-2 px-4 py-2 bg-base-200/50 rounded-lg">
              <span class="{getActivityIcon(stat.action)} size-5 {getActivityColor(stat.action)}"></span>
              <span class="font-medium">{translateAction(stat.action)}</span>
              <span class="badge badge-primary badge-sm">{stat.count}</span>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>
