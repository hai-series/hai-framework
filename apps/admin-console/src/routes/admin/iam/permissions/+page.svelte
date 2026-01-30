<!--
  =============================================================================
  Admin Console - 权限管理页面
  =============================================================================
-->
<script lang="ts">
  import type { PageData } from './$types'

  interface Props {
    data: PageData
  }

  let { data }: Props = $props()

  /** 新建对话框状态 */
  let showDialog = $state(false)

  /** 表单数据 */
  let form = $state({
    name: '',
    description: '',
    resource: '',
    action: '',
  })

  /** 提交中状态 */
  let submitting = $state(false)
  let error = $state('')

  /** 计算权限总数 */
  const totalPermissions = $derived(
    Object.values(data.permissions).reduce((sum, perms) => sum + perms.length, 0),
  )

  /** 打开新建对话框 */
  function openCreateDialog() {
    form = {
      name: '',
      description: '',
      resource: '',
      action: '',
    }
    error = ''
    showDialog = true
  }

  /** 关闭对话框 */
  function closeDialog() {
    showDialog = false
    error = ''
  }

  /** 自动生成权限名称 */
  function updatePermissionName() {
    if (form.resource && form.action) {
      form.name = `${form.resource}:${form.action}`
    }
  }

  /** 提交表单 */
  async function handleSubmit(e: Event) {
    e.preventDefault()
    error = ''

    if (!form.name.trim() || !form.resource.trim() || !form.action.trim()) {
      error = '请填写所有必填字段'
      return
    }

    submitting = true

    try {
      const response = await fetch('/api/iam/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
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

  /** 删除权限 */
  async function handleDelete(perm: { id: string; name: string; is_system: number }) {
    if (perm.is_system) {
      alert('系统权限不能删除')
      return
    }

    if (!confirm(`确定要删除权限 "${perm.name}" 吗？此操作不可恢复。`)) {
      return
    }

    try {
      const response = await fetch(`/api/iam/permissions/${perm.id}`, {
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
  <title>权限管理 - Admin Console</title>
</svelte:head>

<div class="space-y-6">
  <!-- 页面标题 -->
  <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
    <div>
      <h1 class="text-2xl font-bold">权限管理</h1>
      <p class="text-base-content/60 mt-1">管理系统权限定义</p>
    </div>
    <button type="button" class="btn btn-primary gap-2" onclick={openCreateDialog}>
      <span class="icon-[tabler--plus] size-5"></span>
      新建权限
    </button>
  </div>

  <!-- 统计卡片 -->
  <div class="grid gap-4 grid-cols-2 lg:grid-cols-4">
    <div class="stat bg-base-100 rounded-lg shadow-sm">
      <div class="stat-title">权限总数</div>
      <div class="stat-value text-primary">{totalPermissions}</div>
    </div>
    <div class="stat bg-base-100 rounded-lg shadow-sm">
      <div class="stat-title">资源数</div>
      <div class="stat-value">{data.resources.length}</div>
    </div>
    <div class="stat bg-base-100 rounded-lg shadow-sm">
      <div class="stat-title">操作类型</div>
      <div class="stat-value">{data.actions.length}</div>
    </div>
    <div class="stat bg-base-100 rounded-lg shadow-sm">
      <div class="stat-title">系统权限</div>
      <div class="stat-value text-secondary">
        {Object.values(data.permissions).flat().filter((p) => p.is_system).length}
      </div>
    </div>
  </div>

  <!-- 权限列表（按资源分组） -->
  <div class="space-y-4">
    {#each Object.entries(data.permissions) as [resource, perms]}
      <div class="card bg-base-100 shadow-sm">
        <div class="card-body">
          <h3 class="card-title capitalize">
            <span class="icon-[tabler--folder] size-5"></span>
            {resource}
            <span class="badge badge-ghost badge-sm">{perms.length}</span>
          </h3>

          <div class="overflow-x-auto">
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>权限名称</th>
                  <th>操作</th>
                  <th>描述</th>
                  <th>类型</th>
                  <th class="text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {#each perms as perm}
                  <tr class="hover">
                    <td class="font-mono text-sm">{perm.name}</td>
                    <td>
                      <span class="badge badge-outline badge-sm">{perm.action}</span>
                    </td>
                    <td class="text-base-content/60 text-sm">
                      {perm.description ?? '-'}
                    </td>
                    <td>
                      {#if perm.is_system}
                        <span class="badge badge-secondary badge-sm">系统</span>
                      {:else}
                        <span class="badge badge-ghost badge-sm">自定义</span>
                      {/if}
                    </td>
                    <td class="text-right">
                      {#if !perm.is_system}
                        <button
                          type="button"
                          class="btn btn-ghost btn-xs text-error"
                          onclick={() => handleDelete(perm)}
                        >
                          <span class="icon-[tabler--trash] size-4"></span>
                        </button>
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    {/each}
  </div>
</div>

<!-- 新建对话框 -->
{#if showDialog}
  <div class="modal modal-open">
    <div class="modal-box max-w-lg">
      <h3 class="font-bold text-lg mb-4">新建权限</h3>

      <form onsubmit={handleSubmit} class="space-y-4">
        {#if error}
          <div class="alert alert-error">
            <span class="icon-[tabler--alert-circle] size-5"></span>
            <span>{error}</span>
          </div>
        {/if}

        <div class="grid grid-cols-2 gap-4">
          <div class="form-control">
            <label class="label" for="resource">
              <span class="label-text">资源 <span class="text-error">*</span></span>
            </label>
            <input
              type="text"
              id="resource"
              class="input input-bordered"
              bind:value={form.resource}
              oninput={updatePermissionName}
              required
              disabled={submitting}
              placeholder="例如：user, role"
              list="resources"
            />
            <datalist id="resources">
              {#each data.resources as res}
                <option value={res}></option>
              {/each}
            </datalist>
          </div>

          <div class="form-control">
            <label class="label" for="action">
              <span class="label-text">操作 <span class="text-error">*</span></span>
            </label>
            <input
              type="text"
              id="action"
              class="input input-bordered"
              bind:value={form.action}
              oninput={updatePermissionName}
              required
              disabled={submitting}
              placeholder="例如：read, write"
              list="actions"
            />
            <datalist id="actions">
              {#each data.actions as act}
                <option value={act}></option>
              {/each}
            </datalist>
          </div>
        </div>

        <div class="form-control">
          <label class="label" for="name">
            <span class="label-text">权限名称 <span class="text-error">*</span></span>
          </label>
          <input
            type="text"
            id="name"
            class="input input-bordered font-mono"
            bind:value={form.name}
            required
            disabled={submitting}
            placeholder="自动生成：resource:action"
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
            placeholder="权限描述（可选）"
            rows={2}
          ></textarea>
        </div>

        <div class="modal-action">
          <button type="button" class="btn btn-ghost" onclick={closeDialog} disabled={submitting}>
            取消
          </button>
          <button type="submit" class="btn btn-primary" disabled={submitting}>
            {#if submitting}
              <span class="loading loading-spinner loading-sm"></span>
            {/if}
            创建
          </button>
        </div>
      </form>
    </div>
    <div class="modal-backdrop bg-black/50" onclick={closeDialog}></div>
  </div>
{/if}
