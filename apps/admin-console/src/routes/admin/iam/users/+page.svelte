<!--
  =============================================================================
  Admin Console - 用户管理页面
  =============================================================================
-->
<script lang="ts">
  import type { PageData } from './$types'
  import type { UserWithRoles } from '$lib/server/services/user.js'

  interface Props {
    data: PageData
  }

  let { data }: Props = $props()

  /** 搜索关键字 */
  let searchQuery = $state('')

  /** 新建/编辑对话框状态 */
  let showDialog = $state(false)
  let editingUser = $state<UserWithRoles | null>(null)

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
      (user: UserWithRoles) =>
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
  function openEditDialog(user: UserWithRoles) {
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
  async function handleDelete(user: UserWithRoles) {
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
      <h1 class="text-2xl font-bold">用户管理</h1>
      <p class="text-base-content/60 mt-1">管理系统用户账户</p>
    </div>
    <button type="button" class="btn btn-primary gap-2" onclick={openCreateDialog}>
      <span class="icon-[tabler--plus] size-5"></span>
      新建用户
    </button>
  </div>

  <!-- 搜索和过滤 -->
  <div class="card bg-base-100 shadow-sm">
    <div class="card-body py-4">
      <div class="flex flex-col sm:flex-row gap-4">
        <div class="form-control flex-1">
          <div class="input-group">
            <span class="bg-base-200">
              <span class="icon-[tabler--search] size-5"></span>
            </span>
            <input
              type="text"
              placeholder="搜索用户名、邮箱或显示名称..."
              class="input input-bordered w-full"
              bind:value={searchQuery}
            />
          </div>
        </div>
        <div class="text-sm text-base-content/60 self-center">
          共 {filteredUsers.length} 个用户
        </div>
      </div>
    </div>
  </div>

  <!-- 用户列表 -->
  <div class="card bg-base-100 shadow-sm overflow-hidden">
    <div class="overflow-x-auto">
      <table class="table">
        <thead>
          <tr>
            <th>用户</th>
            <th>邮箱</th>
            <th>角色</th>
            <th>状态</th>
            <th>创建时间</th>
            <th class="text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredUsers as user}
            <tr class="hover">
              <td>
                <div class="flex items-center gap-3">
                  <div class="avatar placeholder">
                    <div class="bg-primary/10 text-primary rounded-full w-10">
                      <span>{user.username[0].toUpperCase()}</span>
                    </div>
                  </div>
                  <div>
                    <div class="font-medium">{user.username}</div>
                    {#if user.display_name}
                      <div class="text-sm text-base-content/60">{user.display_name}</div>
                    {/if}
                  </div>
                </div>
              </td>
              <td class="text-base-content/70">{user.email}</td>
              <td>
                <div class="flex flex-wrap gap-1">
                  {#each user.roles as role}
                    <span class="badge badge-outline badge-sm">{role}</span>
                  {/each}
                </div>
              </td>
              <td>
                <span class="badge {getStatusBadge(user.status)} badge-sm">
                  {getStatusText(user.status)}
                </span>
              </td>
              <td class="text-base-content/60 text-sm">
                {new Date(user.created_at).toLocaleDateString('zh-CN')}
              </td>
              <td class="text-right">
                <div class="dropdown dropdown-end">
                  <button type="button" class="btn btn-ghost btn-sm btn-square">
                    <span class="icon-[tabler--dots-vertical] size-5"></span>
                  </button>
                  <ul class="dropdown-content menu bg-base-100 rounded-box shadow-lg border border-base-content/10 w-40 p-2 z-10">
                    <li>
                      <button type="button" onclick={() => openEditDialog(user)}>
                        <span class="icon-[tabler--edit] size-4"></span>
                        编辑
                      </button>
                    </li>
                    <li>
                      <button type="button" class="text-error" onclick={() => handleDelete(user)}>
                        <span class="icon-[tabler--trash] size-4"></span>
                        删除
                      </button>
                    </li>
                  </ul>
                </div>
              </td>
            </tr>
          {:else}
            <tr>
              <td colspan="6" class="text-center py-8 text-base-content/60">
                暂无用户数据
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
</div>

<!-- 新建/编辑对话框 -->
{#if showDialog}
  <div class="modal modal-open">
    <div class="modal-box max-w-lg">
      <h3 class="font-bold text-lg mb-4">
        {editingUser ? '编辑用户' : '新建用户'}
      </h3>

      <form onsubmit={handleSubmit} class="space-y-4">
        {#if error}
          <div class="alert alert-error">
            <span class="icon-[tabler--alert-circle] size-5"></span>
            <span>{error}</span>
          </div>
        {/if}

        <div class="form-control">
          <label class="label" for="username">
            <span class="label-text">用户名 <span class="text-error">*</span></span>
          </label>
          <input
            type="text"
            id="username"
            class="input input-bordered"
            bind:value={form.username}
            required
            disabled={submitting}
            pattern={"^[a-zA-Z0-9_]{3,20}$"}
            placeholder="3-20位字母、数字或下划线"
          />
        </div>

        <div class="form-control">
          <label class="label" for="email">
            <span class="label-text">邮箱 <span class="text-error">*</span></span>
          </label>
          <input
            type="email"
            id="email"
            class="input input-bordered"
            bind:value={form.email}
            required
            disabled={submitting}
            placeholder="user@example.com"
          />
        </div>

        <div class="form-control">
          <label class="label" for="display_name">
            <span class="label-text">显示名称</span>
          </label>
          <input
            type="text"
            id="display_name"
            class="input input-bordered"
            bind:value={form.display_name}
            disabled={submitting}
            placeholder="可选"
          />
        </div>

        <div class="form-control">
          <label class="label" for="password">
            <span class="label-text">
              密码
              {#if !editingUser}<span class="text-error">*</span>{/if}
            </span>
          </label>
          <input
            type="password"
            id="password"
            class="input input-bordered"
            bind:value={form.password}
            required={!editingUser}
            disabled={submitting}
            minlength={8}
            placeholder={editingUser ? '留空则不修改' : '至少8位'}
          />
        </div>

        {#if form.password}
          <div class="form-control">
            <label class="label" for="confirmPassword">
              <span class="label-text">确认密码 <span class="text-error">*</span></span>
            </label>
            <input
              type="password"
              id="confirmPassword"
              class="input input-bordered"
              bind:value={form.confirmPassword}
              required
              disabled={submitting}
              placeholder="请再次输入密码"
            />
          </div>
        {/if}

        <div class="form-control">
          <label class="label" for="status">
            <span class="label-text">状态</span>
          </label>
          <select id="status" class="select select-bordered" bind:value={form.status} disabled={submitting}>
            <option value="active">正常</option>
            <option value="inactive">未激活</option>
            <option value="suspended">已禁用</option>
          </select>
        </div>

        <div class="form-control">
          <label class="label">
            <span class="label-text">角色</span>
          </label>
          <div class="flex flex-wrap gap-2">
            {#each data.roles as role}
              <label class="cursor-pointer flex items-center gap-2">
                <input
                  type="checkbox"
                  class="checkbox checkbox-sm"
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
                <span class="text-sm">{role.name}</span>
              </label>
            {/each}
          </div>
        </div>

        <div class="modal-action">
          <button type="button" class="btn btn-ghost" onclick={closeDialog} disabled={submitting}>
            取消
          </button>
          <button type="submit" class="btn btn-primary" disabled={submitting}>
            {#if submitting}
              <span class="loading loading-spinner loading-sm"></span>
            {/if}
            {editingUser ? '保存' : '创建'}
          </button>
        </div>
      </form>
    </div>
    <div class="modal-backdrop bg-black/50" onclick={closeDialog}></div>
  </div>
{/if}
