<!--
  =============================================================================
  Admin Console - 用户管理页面
  =============================================================================
-->
<script lang="ts">
  import type { PageData } from './$types'
  import { Card, Avatar, Badge, Button, Modal } from '@hai/ui'

  // 定义本地类型（与 page.server.ts 中的 UserData 一致）
  interface UserData {
    id: string
    username: string
    email: string
    display_name: string | null
    avatar: string | null
    status: 'active' | 'inactive' | 'suspended'
    roles: string[]
    created_at: Date
    updated_at: Date
  }

  interface Props {
    data: PageData
  }

  let { data }: Props = $props()

  /** 搜索关键字 */
  let searchQuery = $state('')

  /** 新建/编辑对话框状态 */
  let showDialog = $state(false)
  let editingUser = $state<UserData | null>(null)

  /** 表单数据 */
  let form = $state({
    username: '',
    email: '',
    display_name: '',
    password: '',
    confirmPassword: '',
    status: 'active' as 'active' | 'inactive' | 'suspended',
    roles: [] as string[],
  })

  /** 提交中状态 */
  let submitting = $state(false)
  let error = $state('')

  /** 过滤后的用户列表 */
  const filteredUsers = $derived(
    data.users.filter(
      (user) =>
        user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (user.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false),
    ),
  )

  /** 打开新建对话框 */
  function openCreateDialog() {
    editingUser = null
    form = {
      username: '',
      email: '',
      display_name: '',
      password: '',
      confirmPassword: '',
      status: 'active',
      roles: [],
    }
    error = ''
    showDialog = true
  }

  /** 打开编辑对话框 */
  function openEditDialog(user: UserData) {
    editingUser = user
    form = {
      username: user.username,
      email: user.email,
      display_name: user.display_name ?? '',
      password: '',
      confirmPassword: '',
      status: user.status as 'active' | 'inactive' | 'suspended',
      roles: user.roles,
    }
    error = ''
    showDialog = true
  }

  /** 关闭对话框 */
  function closeDialog() {
    showDialog = false
    editingUser = null
    error = ''
  }

  /** 提交表单 */
  async function handleSubmit(e: Event) {
    e.preventDefault()
    error = ''

    // 验证
    if (!editingUser && form.password !== form.confirmPassword) {
      error = '两次输入的密码不一致'
      return
    }

    submitting = true

    try {
      const url = editingUser ? `/api/iam/users/${editingUser.id}` : '/api/iam/users'
      const method = editingUser ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: form.username,
          email: form.email,
          display_name: form.display_name || undefined,
          password: form.password || undefined,
          status: form.status,
          roles: form.roles,
        }),
      })

      const result = await response.json()

      if (result.success) {
        closeDialog()
        // 刷新页面数据
        location.reload()
      } else {
        error = result.error || '操作失败'
      }
    } catch (e) {
      error = '网络错误，请稍后重试'
    } finally {
      submitting = false
    }
  }

  /** 删除用户 */
  async function handleDelete(user: UserData) {
    if (!confirm(`确定要删除用户 "${user.username}" 吗？此操作不可恢复。`)) {
      return
    }

    try {
      const response = await fetch(`/api/iam/users/${user.id}`, {
        method: 'DELETE',
      })

      const result = await response.json()

      if (result.success) {
        location.reload()
      } else {
        alert(result.error || '删除失败')
      }
    } catch (e) {
      alert('网络错误，请稍后重试')
    }
  }

  /** 获取状态标签样式 */
  function getStatusBadge(status: string): string {
    switch (status) {
      case 'active':
        return 'badge-success'
      case 'inactive':
        return 'badge-warning'
      case 'suspended':
        return 'badge-error'
      default:
        return 'badge-ghost'
    }
  }

  /** 获取状态显示文本 */
  function getStatusText(status: string): string {
    switch (status) {
      case 'active':
        return '正常'
      case 'inactive':
        return '未激活'
      case 'suspended':
        return '已禁用'
      default:
        return status
    }
  }
</script>

<svelte:head>
  <title>用户管理 - Admin Console</title>
</svelte:head>

<div class="space-y-6">
  <!-- 页面标题 -->
  <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
    <div>
      <h1 class="text-2xl font-bold text-slate-800">用户管理</h1>
      <p class="text-slate-500 mt-1">管理系统用户账户</p>
    </div>
    <Button variant="primary" onclick={openCreateDialog}>
      <svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
      </svg>
      新建用户
    </Button>
  </div>

  <!-- 搜索栏 -->
  <Card>
    <div class="p-4">
      <div class="flex flex-col sm:flex-row gap-4">
        <div class="flex-1 relative">
          <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="搜索用户名、邮箱或显示名称..."
            class="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            bind:value={searchQuery}
          />
        </div>
        <div class="text-sm text-slate-500 self-center">
          共 {filteredUsers.length} 个用户
        </div>
      </div>
    </div>
  </Card>

  <!-- 用户列表 -->
  <Card>
    <div class="overflow-x-auto">
      <table class="w-full">
        <thead class="bg-slate-50 border-b border-slate-200">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">用户</th>
            <th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">邮箱</th>
            <th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">角色</th>
            <th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">状态</th>
            <th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">创建时间</th>
            <th class="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          {#each filteredUsers as user}
            <tr class="hover:bg-slate-50 transition-colors">
              <td class="px-6 py-4">
                <div class="flex items-center gap-3">
                  <Avatar name={user.username} size="sm" />
                  <div>
                    <div class="font-medium text-slate-800">{user.username}</div>
                    {#if user.display_name}
                      <div class="text-sm text-slate-500">{user.display_name}</div>
                    {/if}
                  </div>
                </div>
              </td>
              <td class="px-6 py-4 text-sm text-slate-600">{user.email}</td>
              <td class="px-6 py-4">
                <div class="flex flex-wrap gap-1">
                  {#each user.roles as role}
                    <Badge variant="secondary" size="sm">{role}</Badge>
                  {/each}
                </div>
              </td>
              <td class="px-6 py-4">
                <Badge 
                  variant={user.status === 'active' ? 'success' : user.status === 'inactive' ? 'warning' : 'error'}
                  size="sm"
                >
                  {getStatusText(user.status)}
                </Badge>
              </td>
              <td class="px-6 py-4 text-sm text-slate-500">
                {new Date(user.created_at).toLocaleDateString('zh-CN')}
              </td>
              <td class="px-6 py-4 text-right">
                <div class="flex justify-end gap-2">
                  <button
                    type="button"
                    class="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                    onclick={() => openEditDialog(user)}
                    title="编辑"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    class="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    onclick={() => handleDelete(user)}
                    title="删除"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
          {:else}
            <tr>
              <td colspan="6" class="px-6 py-12 text-center text-slate-500">
                <svg class="w-12 h-12 mx-auto text-slate-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                暂无用户数据
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </Card>
</div>

<!-- 新建/编辑对话框 -->
{#if showDialog}
  <Modal 
    open={showDialog} 
    onclose={closeDialog}
    title={editingUser ? '编辑用户' : '新建用户'}
    size="lg"
  >
    <form onsubmit={handleSubmit} class="space-y-5">
      {#if error}
        <div class="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 flex items-center gap-2">
          <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{error}</span>
        </div>
      {/if}

      <!-- 基本信息 -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1" for="username">
            用户名 <span class="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="username"
            class="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-slate-50 disabled:text-slate-500"
            bind:value={form.username}
            required
            disabled={submitting}
            pattern={"^[a-zA-Z0-9_]{3,20}$"}
            placeholder="3-20位字母、数字或下划线"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1" for="email">
            邮箱 <span class="text-red-500">*</span>
          </label>
          <input
            type="email"
            id="email"
            class="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-slate-50 disabled:text-slate-500"
            bind:value={form.email}
            required
            disabled={submitting}
            placeholder="user@example.com"
          />
        </div>
      </div>

      <div>
        <label class="block text-sm font-medium text-slate-700 mb-1" for="display_name">
          显示名称
        </label>
        <input
          type="text"
          id="display_name"
          class="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-slate-50 disabled:text-slate-500"
          bind:value={form.display_name}
          disabled={submitting}
          placeholder="用户的显示名称（可选）"
        />
      </div>

      <!-- 密码 -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1" for="password">
            密码 {#if !editingUser}<span class="text-red-500">*</span>{/if}
          </label>
          <input
            type="password"
            id="password"
            class="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-slate-50 disabled:text-slate-500"
            bind:value={form.password}
            required={!editingUser}
            disabled={submitting}
            minlength={8}
            placeholder={editingUser ? '留空则不修改' : '至少8位'}
          />
        </div>

        {#if form.password || !editingUser}
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1" for="confirmPassword">
              确认密码 {#if !editingUser}<span class="text-red-500">*</span>{/if}
            </label>
            <input
              type="password"
              id="confirmPassword"
              class="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-slate-50 disabled:text-slate-500"
              bind:value={form.confirmPassword}
              required={!editingUser || form.password !== ''}
              disabled={submitting}
              placeholder="请再次输入密码"
            />
          </div>
        {/if}
      </div>

      <!-- 状态 -->
      <div>
        <label class="block text-sm font-medium text-slate-700 mb-1" for="status">
          状态
        </label>
        <select 
          id="status" 
          class="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-slate-50 disabled:text-slate-500"
          bind:value={form.status} 
          disabled={submitting}
        >
          <option value="active">正常</option>
          <option value="inactive">未激活</option>
          <option value="suspended">已禁用</option>
        </select>
      </div>

      <!-- 角色 -->
      <div>
        <label class="block text-sm font-medium text-slate-700 mb-2">
          角色
        </label>
        <div class="flex flex-wrap gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
          {#each data.roles as role}
            <label class="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                class="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                checked={form.roles.includes(role.name)}
                onchange={(e) => {
                  if (e.currentTarget.checked) {
                    form.roles = [...form.roles, role.name]
                  } else {
                    form.roles = form.roles.filter((r) => r !== role.name)
                  }
                }}
                disabled={submitting}
              />
              <span class="text-sm text-slate-700">{role.name}</span>
            </label>
          {/each}
          {#if data.roles.length === 0}
            <span class="text-sm text-slate-500">暂无可分配的角色</span>
          {/if}
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="flex justify-end gap-3 pt-4 border-t border-slate-100">
        <Button variant="secondary" onclick={closeDialog} disabled={submitting}>
          取消
        </Button>
        <Button variant="primary" type="submit" disabled={submitting}>
          {#if submitting}
            <svg class="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          {/if}
          {editingUser ? '保存' : '创建'}
        </Button>
      </div>
    </form>
  </Modal>
{/if}
