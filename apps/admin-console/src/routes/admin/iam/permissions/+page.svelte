<!--
  =============================================================================
  Admin Console - 权限管理页面
  =============================================================================
-->
<script lang="ts">
  import { Card, Button, Modal, Badge, IconButton, Input, Textarea } from '@hai/ui'
  import * as m from '$lib/paraglide/messages'
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
      error = m.iam_permissions_fill_required()
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
        error = result.error || m.iam_users_operation_failed()
      }
    } catch (e) {
      error = m.common_network_error()
    } finally {
      submitting = false
    }
  }

  /** 删除权限 */
  async function handleDelete(perm: { id: string; name: string; is_system: boolean }) {
    if (perm.is_system) {
      alert(m.iam_permissions_system_cannot_delete())
      return
    }

    if (!confirm(m.iam_permissions_delete_confirm())) {
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
        alert(result.error || m.iam_users_delete_failed())
      }
    } catch (e) {
      alert(m.common_network_error())
    }
  }
</script>

<svelte:head>
  <title>{m.iam_permissions_title()} - Admin Console</title>
</svelte:head>

<div class="space-y-6">
  <!-- 页面标题 -->
  <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
    <div>
      <h1 class="text-2xl font-bold">{m.iam_permissions_title()}</h1>
      <p class="text-base-content/60 mt-1">{m.iam_permissions_subtitle()}</p>
    </div>
    <Button variant="primary" class="gap-2" onclick={openCreateDialog}>
      <span class="iconify tabler--plus size-5"></span>
      {m.iam_permissions_create()}
    </Button>
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
      <Card>
        <div class="p-6">
          <h3 class="text-lg font-semibold flex items-center gap-2 mb-4">
            <span class="iconify tabler--folder size-5"></span>
            <span class="capitalize">{resource}</span>
            <Badge size="sm" outline>{perms.length}</Badge>
          </h3>

          <div class="overflow-x-auto">
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>{m.iam_permissions_col_name()}</th>
                  <th>{m.iam_permissions_form_action()}</th>
                  <th>{m.iam_permissions_col_description()}</th>
                  <th>{m.iam_permissions_col_type()}</th>
                  <th class="text-right">{m.iam_permissions_col_actions()}</th>
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
                        <Badge variant="secondary" size="sm">{m.iam_permissions_type_system()}</Badge>
                      {:else}
                        <Badge size="sm" outline>{m.iam_permissions_type_custom()}</Badge>
                      {/if}
                    </td>
                    <td class="text-right">
                      {#if !perm.is_system}
                        <IconButton
                          icon="tabler--trash"
                          size="xs"
                          class="btn-ghost text-error"
                          onclick={() => handleDelete(perm)}
                        />
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    {/each}
  </div>
</div>

<!-- 新建对话框 -->
<Modal open={showDialog} onclose={closeDialog} title={m.iam_permissions_create()} size="lg">
  <form onsubmit={handleSubmit} class="space-y-4">
    {#if error}
      <div class="alert alert-error">
        <span class="iconify tabler--alert-circle size-5"></span>
        <span>{error}</span>
      </div>
    {/if}

    <div class="grid grid-cols-2 gap-4">
      <div class="form-control">
        <label class="label" for="resource">
          <span class="label-text">{m.iam_permissions_form_resource()} <span class="text-error">*</span></span>
        </label>
        <Input
          type="text"
          id="resource"
          bind:value={form.resource}
          oninput={updatePermissionName}
          required
          disabled={submitting}
          placeholder={m.iam_permissions_form_resource_placeholder()}
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
          <span class="label-text">{m.iam_permissions_form_action()} <span class="text-error">*</span></span>
        </label>
        <Input
          type="text"
          id="action"
          bind:value={form.action}
          oninput={updatePermissionName}
          required
          disabled={submitting}
          placeholder={m.iam_permissions_form_action_placeholder()}
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
        <span class="label-text">{m.iam_permissions_form_name()} <span class="text-error">*</span></span>
      </label>
      <Input
        type="text"
        id="name"
        class="font-mono"
        bind:value={form.name}
        required
        disabled={submitting}
        placeholder={m.iam_permissions_form_name_placeholder()}
      />
    </div>

    <div class="form-control">
      <label class="label" for="description">
        <span class="label-text">{m.iam_permissions_form_description()}</span>
      </label>
      <Textarea
        id="description"
        bind:value={form.description}
        disabled={submitting}
        placeholder={m.iam_permissions_form_description_placeholder()}
        rows={2}
      />
    </div>

    <div class="modal-action">
      <Button class="btn-ghost" onclick={closeDialog} disabled={submitting}>
        {m.action_cancel()}
      </Button>
      <Button variant="primary" type="submit" disabled={submitting} loading={submitting}>
        {m.action_create()}
      </Button>
    </div>
  </form>
</Modal>
