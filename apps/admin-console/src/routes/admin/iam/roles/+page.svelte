<!--
  =============================================================================
  Admin Console - 角色管理页面
  =============================================================================
-->
<script lang="ts">
  import type { PageData } from './$types'

  interface Props {
    data: PageData
  }

  let { data }: Props = $props()

  /** 新建/编辑对话框状态 */
  let showDialog = $state(false)
  let editingRole = $state<typeof data.roles[0] | null>(null)

  /** 表单数据 */
  let form = $state({
    name: '',
    description: '',
    permissions: [] as string[],
  })

  /** 提交中状态 */
  let submitting = $state(false)
  let error = $state('')

  /** 打开新建对话框 */
  function openCreateDialog() {
    editingRole = null
    form = {
      name: '',
      description: '',
      permissions: [],
    }
    error = ''
    showDialog = true
  }

  /** 打开编辑对话框 */
  function openEditDialog(role: typeof data.roles[0]) {
    editingRole = role
    form = {
      name: role.name,
      description: role.description ?? '',
      permissions: [...role.permissions],
    }
    error = ''
    showDialog = true
  }

  /** 关闭对话框 */
  function closeDialog() {
    showDialog = false
    editingRole = null
    error = ''
  }

  /** 切换权限选择 */
  function togglePermission(permName: string) {
    if (form.permissions.includes(permName)) {
      form.permissions = form.permissions.filter((p) => p !== permName)
    } else {
      form.permissions = [...form.permissions, permName]
    }
  }

  /** 切换资源组所有权限 */
  function toggleResourcePermissions(resource: string, permissions: { name: string }[]) {
    const permNames = permissions.map((p) => p.name)
    const allSelected = permNames.every((p) => form.permissions.includes(p))

    if (allSelected) {
      form.permissions = form.permissions.filter((p) => !permNames.includes(p))
    } else {
      form.permissions = [...new Set([...form.permissions, ...permNames])]
    }
  }

  /** 提交表单 */
  async function handleSubmit(e: Event) {
    e.preventDefault()
    error = ''

    if (!form.name.trim()) {
      error = '请输入角色名称'
      return
    }

    submitting = true

    try {
      const url = editingRole ? `/api/iam/roles/${editingRole.id}` : '/api/iam/roles'
      const method = editingRole ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          description: form.description || undefined,
          permissions: form.permissions,
        }),
      })

      const result = await response.json()

      if (result.success) {
        closeDialog()
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

  /** 删除角色 */
  async function handleDelete(role: typeof data.roles[0]) {
    if (role.isSystem) {
      alert('系统角色不能删除')
      return
    }

    if (!confirm(`确定要删除角色 "${role.name}" 吗？此操作不可恢复。`)) {
      return
    }

    try {
      const response = await fetch(`/api/iam/roles/${role.id}`, {
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
</script>

<svelte:head>
  <title>角色管理 - Admin Console</title>
</svelte:head>

<div class="space-y-6">
  <!-- 页面标题 -->
  <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
    <div>
      <h1 class="text-2xl font-bold">角色管理</h1>
      <p class="text-base-content/60 mt-1">管理系统角色和权限分配</p>
    </div>
    <button type="button" class="btn btn-primary gap-2" onclick={openCreateDialog}>
      <span class="iconify tabler--plus size-5"></span>
      新建角色
    </button>
  </div>

  <!-- 角色列表 -->
  <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
    {#each data.roles as role}
      <div class="card bg-base-100 shadow-sm">
        <div class="card-body">
          <div class="flex items-start justify-between">
            <div>
              <h3 class="card-title text-lg">
                {role.name}
                {#if role.isSystem}
                  <span class="badge badge-outline badge-sm">系统</span>
                {/if}
              </h3>
              {#if role.description}
                <p class="text-sm text-base-content/60 mt-1">{role.description}</p>
              {/if}
            </div>
            <div class="dropdown dropdown-end">
              <button type="button" class="btn btn-ghost btn-sm btn-square">
                <span class="iconify tabler--dots-vertical size-5"></span>
              </button>
              <ul class="dropdown-content menu bg-base-100 rounded-box shadow-lg border border-base-content/10 w-40 p-2 z-10">
                <li>
                  <button type="button" onclick={() => openEditDialog(role)}>
                    <span class="iconify tabler--edit size-4"></span>
                    编辑
                  </button>
                </li>
                {#if !role.isSystem}
                  <li>
                    <button type="button" class="text-error" onclick={() => handleDelete(role)}>
                      <span class="iconify tabler--trash size-4"></span>
                      删除
                    </button>
                  </li>
                {/if}
              </ul>
            </div>
          </div>

          <div class="divider my-2"></div>

          <div class="flex items-center justify-between text-sm">
            <span class="text-base-content/60">
              <span class="iconify tabler--users size-4 inline-block align-middle mr-1"></span>
              {role.userCount} 个用户
            </span>
            <span class="text-base-content/60">
              <span class="iconify tabler--key size-4 inline-block align-middle mr-1"></span>
              {role.permissions.length} 个权限
            </span>
          </div>

          {#if role.permissions.length > 0}
            <div class="flex flex-wrap gap-1 mt-2">
              {#each role.permissions.slice(0, 5) as perm}
                <span class="badge badge-ghost badge-sm">{perm}</span>
              {/each}
              {#if role.permissions.length > 5}
                <span class="badge badge-ghost badge-sm">+{role.permissions.length - 5}</span>
              {/if}
            </div>
          {/if}
        </div>
      </div>
    {/each}
  </div>
</div>

<!-- 新建/编辑对话框 -->
{#if showDialog}
  <div class="modal modal-open">
    <div class="modal-box max-w-2xl max-h-[90vh]">
      <h3 class="font-bold text-lg mb-4">
        {editingRole ? '编辑角色' : '新建角色'}
      </h3>

      <form onsubmit={handleSubmit} class="space-y-4">
        {#if error}
          <div class="alert alert-error">
            <span class="iconify tabler--alert-circle size-5"></span>
            <span>{error}</span>
          </div>
        {/if}

        <div class="form-control">
          <label class="label" for="name">
            <span class="label-text">角色名称 <span class="text-error">*</span></span>
          </label>
          <input
            type="text"
            id="name"
            class="input input-bordered"
            bind:value={form.name}
            required
            disabled={submitting || Boolean(editingRole?.isSystem)}
            placeholder="例如：editor, viewer"
          />
        </div>

        <div class="form-control">
          <label class="label" for="description">
            <span class="label-text">描述</span>
          </label>
          <textarea
            id="description"
            class="textarea textarea-bordered"
            bind:value={form.description}
            disabled={submitting}
            placeholder="角色描述（可选）"
            rows={2}
          ></textarea>
        </div>

        <div class="form-control">
          <label class="label">
            <span class="label-text">权限分配</span>
            <span class="label-text-alt text-base-content/60">
              已选 {form.permissions.length} 个权限
            </span>
          </label>

          <div class="border border-base-content/10 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
            {#each Object.entries(data.permissions) as [resource, perms]}
              <div class="border-b border-base-content/10 last:border-b-0">
                <div
                  class="flex items-center justify-between px-4 py-2 bg-base-200/50 cursor-pointer hover:bg-base-200"
                  onclick={() => toggleResourcePermissions(resource, perms)}
                >
                  <span class="font-medium capitalize">{resource}</span>
                  <input
                    type="checkbox"
                    class="checkbox checkbox-sm"
                    checked={perms.every((p) => form.permissions.includes(p.name))}
                    readonly
                  />
                </div>
                <div class="px-4 py-2 grid grid-cols-2 gap-2">
                  {#each perms as perm}
                    <label class="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        class="checkbox checkbox-sm"
                        checked={form.permissions.includes(perm.name)}
                        onchange={() => togglePermission(perm.name)}
                        disabled={submitting}
                      />
                      <span class="text-sm">{perm.name}</span>
                    </label>
                  {/each}
                </div>
              </div>
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
            {editingRole ? '保存' : '创建'}
          </button>
        </div>
      </form>
    </div>
    <div class="modal-backdrop bg-black/50" onclick={closeDialog}></div>
  </div>
{/if}
