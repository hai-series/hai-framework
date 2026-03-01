<!--
  Admin Console - 用户管理页面
-->
<script lang="ts">
  import type { PageData } from './$types'
  import { goto, invalidateAll } from '$app/navigation'
  import * as m from '$lib/paraglide/messages'
  import { apiFetch } from '$lib/utils/api'

  // 定义本地类型（与 page.server.ts 中的 UserData 一致）
  interface UserData {
    id: string
    username: string
    email: string
    display_name: string | null
    avatar: string | null
    status: 'active' | 'inactive' | 'suspended'
    roles: string[]
    roleIds: string[]
    created_at: Date
    updated_at: Date
  }

  interface RoleData {
    id: string
    name: string
  }

  interface Props {
    data: PageData & {
      users: UserData[]
      roles: RoleData[]
      total: number
      page: number
      pageSize: number
      search: string
      status: string
      role: string
    }
  }

  let { data }: Props = $props()

  // ─── 权限判断 ───
  const userPermissions = $derived(data.user?.permissions ?? [])

  /** 检查当前用户是否拥有指定权限 */
  function hasPerm(permission: string): boolean {
    for (const p of userPermissions) {
      if (p === permission || p === '*') return true
      if (p.endsWith(':*') && permission.startsWith(p.slice(0, -1))) return true
    }
    return false
  }

  const canCreate = $derived(hasPerm('user:create'))
  const canUpdate = $derived(hasPerm('user:update'))
  const canDelete = $derived(hasPerm('user:delete'))

  // 从 IAM 配置读取密码最小长度
  const passwordMinLength = $derived(data.iamPublicConfig?.password?.minLength ?? 8)

  /** 搜索关键字（与 URL 同步） */
  let searchQuery = $state('')
  /** 状态筛选 */
  let statusFilter = $state('')
  /** 角色筛选 */
  let roleFilter = $state('')

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

  /** 搜索防抖定时器 */
  let searchTimer: ReturnType<typeof setTimeout> | undefined

  /** 当 data 更新时同步本地筛选状态 */
  $effect(() => {
    searchQuery = data.search
    statusFilter = data.status
    roleFilter = data.role
  })

  /** 构建带查询参数的 URL 并导航 */
  function navigateWithParams(overrides: Record<string, string | number>) {
    const params = new URLSearchParams()
    const merged = {
      search: searchQuery,
      status: statusFilter,
      role: roleFilter,
      page: data.page,
      pageSize: data.pageSize,
      ...overrides,
    }
    if (merged.search) params.set('search', String(merged.search))
    if (merged.status) params.set('status', String(merged.status))
    if (merged.role) params.set('role', String(merged.role))
    if (merged.page && merged.page !== 1) params.set('page', String(merged.page))
    if (merged.pageSize && merged.pageSize !== 20) params.set('pageSize', String(merged.pageSize))
    const qs = params.toString()
    goto(`/admin/iam/users${qs ? `?${qs}` : ''}`, { invalidateAll: true })
  }

  /** 搜索输入防抖 */
  function handleSearchInput() {
    clearTimeout(searchTimer)
    searchTimer = setTimeout(() => {
      navigateWithParams({ search: searchQuery, page: 1 })
    }, 400)
  }

  /** 状态筛选变更 */
  function handleStatusChange(e: Event) {
    const target = e.target as HTMLSelectElement
    statusFilter = target.value
    navigateWithParams({ status: statusFilter, page: 1 })
  }

  /** 角色筛选变更 */
  function handleRoleChange(e: Event) {
    const target = e.target as HTMLSelectElement
    roleFilter = target.value
    navigateWithParams({ role: roleFilter, page: 1 })
  }

  /** 分页变更 */
  function handlePageChange(newPage: number) {
    navigateWithParams({ page: newPage })
  }

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
      roles: [...user.roleIds],
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

      const response = await apiFetch(url, {
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
        await invalidateAll()
      } else {
        error = result.error?.message || m.iam_users_operation_failed()
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
      const response = await apiFetch(`/api/iam/users/${user.id}`, {
        method: 'DELETE',
      })

      const result = await response.json()

      if (result.success) {
        await invalidateAll()
      } else {
        alert(result.error?.message || m.iam_users_delete_failed())
      }
    } catch (e) {
      alert(m.common_network_error())
    }
  }

  /** 获取状态显示文本 */
  function getStatusText(status: string): string {
    switch (status) {
      case 'active':
        return m.iam_users_status_active()
      case 'inactive':
        return m.iam_users_status_inactive()
      case 'suspended':
        return m.iam_users_status_disabled()
      default:
        return status
    }
  }
</script>

<svelte:head>
  <title>{m.iam_users_title()} - {m.app_title()}</title>
</svelte:head>

<div class="space-y-4">
  <!-- 页面标题 -->
  <PageHeader title={m.iam_users_title()} description={m.iam_users_subtitle()}>
    {#snippet actions()}
      {#if canCreate}
        <Button variant="primary" onclick={openCreateDialog}>
          <span class="icon-[tabler--plus] size-4.5 mr-1"></span>
          {m.iam_users_create()}
        </Button>
      {/if}
    {/snippet}
  </PageHeader>

  <!-- 搜索 + 筛选栏 -->
  <Card>
    <div class="p-4">
      <div class="flex flex-col sm:flex-row gap-3">
        <!-- 搜索框 -->
        <div class="flex-1 relative">
          <span class="icon-[tabler--search] size-4.5 absolute left-3 top-1/2 -translate-y-1/2 text-base-content/35 z-10"></span>
          <Input
            type="text"
            placeholder={m.iam_users_search_placeholder()}
            class="pl-10"
            bind:value={searchQuery}
            oninput={handleSearchInput}
            autocomplete="off"
          />
        </div>
        <!-- 状态筛选 -->
        <select
          class="select select-sm h-10 min-w-32"
          value={statusFilter}
          onchange={handleStatusChange}
        >
          <option value="">{m.iam_users_filter_all_statuses()}</option>
          <option value="active">{m.iam_users_status_active()}</option>
          <option value="suspended">{m.iam_users_status_disabled()}</option>
        </select>
        <!-- 角色筛选 -->
        <select
          class="select select-sm h-10 min-w-32"
          value={roleFilter}
          onchange={handleRoleChange}
        >
          <option value="">{m.iam_users_filter_all_roles()}</option>
          {#each data.roles as role}
            <option value={role.name}>{role.name}</option>
          {/each}
        </select>
        <!-- 总数 -->
        <div class="text-sm text-base-content/50 self-center whitespace-nowrap">
          {m.logs_total_count({ count: data.total })}
        </div>
      </div>
    </div>
  </Card>

  <!-- 用户列表 -->
  <Card>
    <div class="overflow-x-auto">
      <table class="w-full text-[13px]">
        <thead>
          <tr class="border-b border-base-content/6">
            <th class="px-5 py-3.5 text-left text-xs font-semibold text-base-content/50 uppercase tracking-wider">{m.iam_users_col_username()}</th>
            <th class="px-5 py-3.5 text-left text-xs font-semibold text-base-content/50 uppercase tracking-wider">{m.iam_users_col_email()}</th>
            <th class="px-5 py-3.5 text-left text-xs font-semibold text-base-content/50 uppercase tracking-wider">{m.iam_users_col_roles()}</th>
            <th class="px-5 py-3.5 text-left text-xs font-semibold text-base-content/50 uppercase tracking-wider">{m.iam_users_col_status()}</th>
            <th class="px-5 py-3.5 text-left text-xs font-semibold text-base-content/50 uppercase tracking-wider">{m.iam_users_col_created_at()}</th>
            {#if canUpdate || canDelete}
              <th class="px-5 py-3.5 text-right text-xs font-semibold text-base-content/50 uppercase tracking-wider">{m.iam_users_col_actions()}</th>
            {/if}
          </tr>
        </thead>
        <tbody class="divide-y divide-base-content/5">
          {#each data.users as user}
            <tr class="hover:bg-base-200/30 transition-colors">
              <td class="px-5 py-3.5">
                <div class="flex items-center gap-3">
                  <Avatar name={user.username} size="sm" />
                  <div>
                    <div class="font-medium text-base-content">{user.username}</div>
                    {#if user.display_name}
                      <div class="text-sm text-base-content/50">{user.display_name}</div>
                    {/if}
                  </div>
                </div>
              </td>
              <td class="px-5 py-3.5 text-sm text-base-content/70">{user.email}</td>
              <td class="px-5 py-3.5">
                <div class="flex flex-wrap gap-1">
                  {#each user.roles as role}
                    <Badge variant="secondary" size="sm">{role}</Badge>
                  {/each}
                </div>
              </td>
              <td class="px-5 py-3.5">
                <Badge 
                  variant={user.status === 'active' ? 'success' : user.status === 'inactive' ? 'warning' : 'error'}
                  size="sm"
                >
                  {getStatusText(user.status)}
                </Badge>
              </td>
              <td class="px-5 py-3.5 text-sm text-base-content/50">
                {new Date(user.created_at).toLocaleDateString('zh-CN')}
              </td>
              {#if canUpdate || canDelete}
              <td class="px-5 py-3.5 text-right">
                <div class="flex justify-end gap-1">
                  {#if canUpdate}
                    <IconButton
                      variant="ghost"
                      size="sm"
                      onclick={() => openEditDialog(user)}
                      ariaLabel={m.action_edit()}
                    >
                      <span class="icon-[tabler--edit] size-4"></span>
                    </IconButton>
                  {/if}
                  {#if canDelete}
                    <IconButton
                      variant="ghost"
                      size="sm"
                      onclick={() => handleDelete(user)}
                      ariaLabel={m.action_delete()}
                      class="hover:text-error"
                    >
                      <span class="icon-[tabler--trash] size-4"></span>
                    </IconButton>
                  {/if}
                </div>
              </td>
              {/if}
            </tr>
          {:else}
            <tr>
              <td colspan={canUpdate || canDelete ? 6 : 5} class="px-5 py-16 text-center text-base-content/30">
                <span class="icon-[tabler--users] size-12 mx-auto text-base-content/15 block mb-3"></span>
                {m.common_no_data()}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <!-- 分页 -->
    {#if data.total > data.pageSize}
      <div class="flex justify-center p-4 border-t border-base-content/5">
        <Pagination
          page={data.page}
          total={data.total}
          pageSize={data.pageSize}
          size="sm"
          showTotal
          onchange={handlePageChange}
        />
      </div>
    {/if}
  </Card>
</div>

<!-- 新建/编辑对话框 -->
{#if showDialog}
  <Modal 
    open={showDialog} 
    onclose={closeDialog}
    title={editingUser ? m.iam_users_edit() : m.iam_users_create()}
    size="3xl"
    closeOnBackdrop={false}
  >
    <form onsubmit={handleSubmit} class="space-y-5">
      {#if error}
        <div class="p-3 bg-error/10 border border-error/20 rounded-lg text-sm text-error flex items-center gap-2">
          <span class="icon-[tabler--alert-circle] size-4 shrink-0"></span>
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
            minLength={passwordMinLength}
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
        <div class="flex flex-wrap gap-3 p-3 bg-base-200 rounded-lg">
          {#each data.roles as role}
            <label class="inline-flex items-center gap-2 cursor-pointer">
              <Checkbox
                size="sm"
                checked={form.roles.includes(role.id)}
                onchange={(checked: boolean) => {
                  if (checked) {
                    form.roles = [...form.roles, role.id]
                  } else {
                    form.roles = form.roles.filter((r) => r !== role.id)
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
      <div class="flex justify-end gap-3 pt-4 border-t border-base-content/5">
        <Button variant="secondary" onclick={closeDialog} disabled={submitting}>
          {m.action_cancel()}
        </Button>
        <Button variant="primary" type="submit" disabled={submitting}>
          {#if submitting}
            <span class="loading loading-spinner loading-xs mr-2"></span>
          {/if}
          {editingUser ? m.action_save() : m.action_create()}
        </Button>
      </div>
    </form>
  </Modal>
{/if}
