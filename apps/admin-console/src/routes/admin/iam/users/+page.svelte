<!--
  =============================================================================
  Admin Console - 用户管理页面
  =============================================================================
-->
<script lang="ts">
  import type { PageData } from './$types'
  import { Avatar, Badge, Button, Card, Checkbox, IconButton, Input, Modal, PageHeader, PasswordInput, Select } from '@hai/ui'
  import * as m from '$lib/paraglide/messages'

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

  interface RoleData {
    name: string
  }

  interface Props {
    data: PageData & {
      users: UserData[]
      roles: RoleData[]
    }
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
      error = m.iam_users_password_mismatch()
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
        error = result.error || m.iam_users_operation_failed()
      }
    } catch (e) {
      error = m.common_network_error()
    } finally {
      submitting = false
    }
  }

  /** 删除用户 */
  async function handleDelete(user: UserData) {
    if (!confirm(m.iam_users_delete_confirm())) {
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
        alert(result.error || m.iam_users_delete_failed())
      }
    } catch (e) {
      alert(m.common_network_error())
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
        return `${m.iam_users_status_active()} (${status})`
      case 'inactive':
        return `${m.iam_users_status_inactive()} (${status})`
      case 'suspended':
        return `${m.iam_users_status_disabled()} (${status})`
      default:
        return status
    }
  }
</script>

<svelte:head>
  <title>{m.iam_users_title()} - Admin Console</title>
</svelte:head>

<div class="space-y-6">
  <!-- 页面标题 -->
  <PageHeader title={m.iam_users_title()} description={m.iam_users_subtitle()}>
    {#snippet actions()}
      <Button variant="primary" onclick={openCreateDialog}>
        <svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        {m.iam_users_create()}
      </Button>
    {/snippet}
  </PageHeader>

  <!-- 搜索栏 -->
  <Card>
    <div class="p-4">
      <div class="flex flex-col sm:flex-row gap-4">
        <div class="flex-1 relative">
          <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-base-content/40 z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <Input
            type="text"
            placeholder={m.iam_users_search_placeholder()}
            class="pl-10"
            bind:value={searchQuery}
          />
        </div>
        <div class="text-sm text-base-content/60 self-center">
          共 {filteredUsers.length} 个用户
        </div>
      </div>
    </div>
  </Card>

  <!-- 用户列表 -->
  <Card>
    <div class="overflow-x-auto">
      <table class="w-full">
        <thead class="bg-base-200 border-b border-base-content/10">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-semibold text-base-content/60 uppercase tracking-wider">{m.iam_users_col_username()}</th>
            <th class="px-6 py-3 text-left text-xs font-semibold text-base-content/60 uppercase tracking-wider">{m.iam_users_col_email()}</th>
            <th class="px-6 py-3 text-left text-xs font-semibold text-base-content/60 uppercase tracking-wider">{m.iam_users_col_roles()}</th>
            <th class="px-6 py-3 text-left text-xs font-semibold text-base-content/60 uppercase tracking-wider">{m.iam_users_col_status()}</th>
            <th class="px-6 py-3 text-left text-xs font-semibold text-base-content/60 uppercase tracking-wider">{m.iam_users_col_created_at()}</th>
            <th class="px-6 py-3 text-right text-xs font-semibold text-base-content/60 uppercase tracking-wider">{m.iam_users_col_actions()}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-base-content/5">
          {#each filteredUsers as user}
            <tr class="hover:bg-base-200/50 transition-colors">
              <td class="px-6 py-4">
                <div class="flex items-center gap-3">
                  <Avatar name={user.username} size="sm" />
                  <div>
                    <div class="font-medium text-base-content">{user.username}</div>
                    {#if user.display_name}
                      <div class="text-sm text-base-content/60">{user.display_name}</div>
                    {/if}
                  </div>
                </div>
              </td>
              <td class="px-6 py-4 text-sm text-base-content/80">{user.email}</td>
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
              <td class="px-6 py-4 text-sm text-base-content/60">
                {new Date(user.created_at).toLocaleDateString('zh-CN')}
              </td>
              <td class="px-6 py-4 text-right">
                <div class="flex justify-end gap-2">
                  <IconButton
                    variant="ghost"
                    size="sm"
                    onclick={() => openEditDialog(user)}
                    ariaLabel={m.action_edit()}
                  >
                    <span class="iconify tabler--edit size-4"></span>
                  </IconButton>
                  <IconButton
                    variant="ghost"
                    size="sm"
                    onclick={() => handleDelete(user)}
                    ariaLabel={m.action_delete()}
                    class="hover:text-error"
                  >
                    <span class="iconify tabler--trash size-4"></span>
                  </IconButton>
                </div>
              </td>
            </tr>
          {:else}
            <tr>
              <td colspan="6" class="px-6 py-12 text-center text-base-content/60">
                <svg class="w-12 h-12 mx-auto text-base-content/20 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                {m.common_no_data()}
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
    title={editingUser ? m.iam_users_edit() : m.iam_users_create()}
    size="lg"
  >
    <form onsubmit={handleSubmit} class="space-y-5">
      {#if error}
        <div class="p-3 bg-error/10 border border-error/20 rounded-lg text-sm text-error flex items-center gap-2">
          <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{error}</span>
        </div>
      {/if}

      <!-- 基本信息 -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium text-base-content mb-1" for="username">
            {m.iam_users_form_username()} <span class="text-error">*</span>
          </label>
          <Input
            type="text"
            id="username"
            bind:value={form.username}
            required
            disabled={submitting}
            pattern={"^[a-zA-Z0-9_]{3,20}$"}
            placeholder="3-20位字母、数字或下划线"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-base-content mb-1" for="email">
            {m.iam_users_form_email()} <span class="text-error">*</span>
          </label>
          <Input
            type="email"
            id="email"
            bind:value={form.email}
            required
            disabled={submitting}
            placeholder="user@example.com"
          />
        </div>
      </div>

      <div>
        <label class="block text-sm font-medium text-base-content mb-1" for="display_name">
          {m.iam_users_form_display_name()}
        </label>
        <Input
          type="text"
          id="display_name"
          bind:value={form.display_name}
          disabled={submitting}
          placeholder={m.iam_users_form_display_name_placeholder()}
        />
      </div>

      <!-- 密码 -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium text-base-content mb-1" for="password">
            {m.iam_users_form_password()} {#if !editingUser}<span class="text-error">*</span>{/if}
          </label>
          <PasswordInput
            bind:value={form.password}
            placeholder={editingUser ? m.iam_users_form_password_hint() : m.iam_users_form_password_placeholder()}
            required={!editingUser}
            disabled={submitting}
            minLength={8}
            showStrength={!editingUser}
            size="sm"
          />
        </div>

        {#if form.password || !editingUser}
          <div>
            <label class="block text-sm font-medium text-base-content mb-1" for="confirmPassword">
              {m.iam_users_form_confirm_password()} {#if !editingUser}<span class="text-error">*</span>{/if}
            </label>
            <PasswordInput
              bind:value={form.confirmPassword}
              placeholder={m.iam_users_form_confirm_password_placeholder()}
              required={!editingUser || form.password !== ''}
              disabled={submitting}
              size="sm"
            />
          </div>
        {/if}
      </div>

      <!-- 状态 -->
      <div>
        <label class="block text-sm font-medium text-base-content mb-1" for="status">
          {m.iam_users_col_status()}
        </label>
        <Select 
          id="status" 
          bind:value={form.status} 
          disabled={submitting}
        >
          <option value="active">{m.iam_users_status_active()}</option>
          <option value="inactive">{m.iam_users_status_inactive()}</option>
          <option value="suspended">{m.iam_users_status_disabled()}</option>
        </Select>
      </div>

      <!-- 角色 -->
      <fieldset>
        <legend class="block text-sm font-medium text-base-content mb-2">
          {m.iam_users_col_roles()}
        </legend>
        <div class="flex flex-wrap gap-3 p-3 bg-base-200 rounded-lg border border-base-content/10">
          {#each data.roles as role}
            <label class="inline-flex items-center gap-2 cursor-pointer">
              <Checkbox
                size="sm"
                checked={form.roles.includes(role.name)}
                onchange={(checked: boolean) => {
                  if (checked) {
                    form.roles = [...form.roles, role.name]
                  } else {
                    form.roles = form.roles.filter((r) => r !== role.name)
                  }
                }}
                disabled={submitting}
              />
              <span class="text-sm text-base-content">{role.name}</span>
            </label>
          {/each}
          {#if data.roles.length === 0}
            <span class="text-sm text-base-content/60">{m.common_no_data()}</span>
          {/if}
        </div>
      </fieldset>

      <!-- 操作按钮 -->
      <div class="flex justify-end gap-3 pt-4 border-t border-base-content/10">
        <Button variant="secondary" onclick={closeDialog} disabled={submitting}>
          {m.action_cancel()}
        </Button>
        <Button variant="primary" type="submit" disabled={submitting}>
          {#if submitting}
            <svg class="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          {/if}
          {editingUser ? m.action_save() : m.action_create()}
        </Button>
      </div>
    </form>
  </Modal>
{/if}
