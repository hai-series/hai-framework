<!--
  =============================================================================
  Admin Console - 角色管理页面
  =============================================================================
-->
<script lang="ts">
  import type { PageData } from './$types'
  import * as m from '$lib/paraglide/messages'

  interface RoleData {
    id: string
    name: string
    description?: string | null
    permissions: string[]
    userCount: number
    isSystem: boolean
  }

  interface PermissionItem {
    name: string
  }

  type PermissionsByResource = Record<string, PermissionItem[]>

  interface Props {
    data: PageData & {
      roles: RoleData[]
      permissions: PermissionsByResource
    }
  }

  let { data }: Props = $props()

  /** 新建/编辑对话框状态 */
  let showDialog = $state(false)
  let editingRole = $state<RoleData | null>(null)

  /** 表单数据 */
  let form = $state({
    name: '',
    description: '',
    permissions: [] as string[],
  })

  /** 提交中状态 */
  let submitting = $state(false)
  let error = $state('')
  let dialogOpenedAt = $state(0)

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
    dialogOpenedAt = Date.now()
  }

  /** 打开编辑对话框 */
  function openEditDialog(role: RoleData) {
    editingRole = role
    form = {
      name: role.name,
      description: role.description ?? '',
      permissions: [...role.permissions],
    }
    error = ''
    showDialog = true
    dialogOpenedAt = Date.now()
  }

  /** 关闭对话框 */
  function closeDialog(source: 'action' | 'backdrop' = 'action') {
    if (source === 'backdrop' && Date.now() - dialogOpenedAt < 25) {
      return
    }
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
  function toggleResourcePermissions(resource: string, permissions: PermissionItem[]) {
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
      error = m.iam_roles_fill_name()
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
        error = result.error || m.iam_roles_operation_failed()
      }
    } catch (e) {
      error = m.common_network_error()
    } finally {
      submitting = false
    }
  }

  /** 删除角色 */
  async function handleDelete(role: RoleData) {
    if (role.isSystem) {
      alert(m.iam_roles_system_cannot_delete())
      return
    }

    if (!confirm(m.iam_roles_delete_confirm({ name: role.name }))) {
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
        alert(result.error || m.iam_roles_delete_failed())
      }
    } catch (e) {
      alert(m.common_network_error())
    }
  }
</script>

<svelte:head>
  <title>{m.iam_roles_title()} - Admin Console</title>
</svelte:head>

<div class="space-y-6">
  <!-- 页面标题 -->
  <PageHeader title={m.iam_roles_title()} description={m.iam_roles_subtitle()}>
    {#snippet actions()}
      <Button variant="primary" class="gap-2" onclick={openCreateDialog}>
        <span class="iconify tabler--plus size-5"></span>
        {m.iam_roles_create()}
      </Button>
    {/snippet}
  </PageHeader>

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
                  <Badge variant="default" size="sm" outline>{m.iam_roles_type_system()}</Badge>
                {/if}
              </h3>
              {#if role.description}
                <p class="text-sm text-base-content/60 mt-1">{role.description}</p>
              {/if}
            </div>
            <div class="dropdown dropdown-end">
              <IconButton variant="ghost" size="sm" ariaLabel={m.iam_roles_action_menu()}>
                <span class="iconify tabler--dots-vertical size-5"></span>
              </IconButton>
              <ul class="dropdown-content menu bg-base-100 rounded-box shadow-lg w-40 p-2 z-10">
                <li>
                  <Button variant="ghost" class="justify-start" onclick={() => openEditDialog(role)}>
                    <span class="iconify tabler--edit size-4"></span>
                    {m.action_edit()}
                  </Button>
                </li>
                {#if !role.isSystem}
                  <li>
                    <Button variant="ghost" class="justify-start text-error" onclick={() => handleDelete(role)}>
                      <span class="iconify tabler--trash size-4"></span>
                      {m.action_delete()}
                    </Button>
                  </li>
                {/if}
              </ul>
            </div>
          </div>

          <div class="divider my-2"></div>

          <div class="flex items-center justify-between text-sm">
            <span class="text-base-content/60">
              <span class="iconify tabler--users size-4 inline-block align-middle mr-1"></span>
              {m.iam_roles_user_count({ count: role.userCount })}
            </span>
            <span class="text-base-content/60">
              <span class="iconify tabler--key size-4 inline-block align-middle mr-1"></span>
              {m.iam_roles_permission_count({ count: role.permissions.length })}
            </span>
          </div>

          {#if role.permissions.length > 0}
            <div class="flex flex-wrap gap-1 mt-2">
              {#each role.permissions.slice(0, 5) as perm}
                <Badge variant="ghost" size="sm">{perm}</Badge>
              {/each}
              {#if role.permissions.length > 5}
                <Badge variant="ghost" size="sm">+{role.permissions.length - 5}</Badge>
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
        {editingRole ? m.iam_roles_edit() : m.iam_roles_create()}
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
            <span class="label-text">{m.iam_roles_form_name()} <span class="text-error">*</span></span>
          </label>
          <Input
            type="text"
            id="name"
            bind:value={form.name}
            required
            disabled={submitting || Boolean(editingRole?.isSystem)}
            placeholder={m.iam_roles_form_name_placeholder()}
          />
        </div>

        <div class="form-control">
          <label class="label" for="description">
            <span class="label-text">{m.iam_roles_form_description()}</span>
          </label>
          <Textarea
            id="description"
            bind:value={form.description}
            disabled={submitting}
            placeholder={m.iam_roles_form_description_placeholder()}
            rows={2}
          />
        </div>

        <fieldset class="form-control">
          <legend class="label">
            <span class="label-text">{m.iam_roles_form_permissions()}</span>
            <span class="label-text-alt text-base-content/60">
              {m.iam_roles_form_permissions_selected({ count: form.permissions.length })}
            </span>
          </legend>

          <div class="rounded-lg overflow-hidden max-h-64 overflow-y-auto bg-base-200/50">
            {#each Object.entries(data.permissions) as [resource, perms]}
              <div class="border-b border-base-content/5 last:border-b-0">
                <BareButton
                  type="button"
                  class="flex w-full items-center justify-between px-4 py-2 bg-base-200/50 cursor-pointer hover:bg-base-200"
                  onclick={() => toggleResourcePermissions(resource, perms)}
                  ariaLabel={m.iam_roles_form_permissions()}
                >
                  <span class="font-medium capitalize">{resource}</span>
                  <Checkbox
                    size="sm"
                    checked={perms.every((p) => form.permissions.includes(p.name))}
                    readonly
                  />
                </BareButton>
                <div class="px-4 py-2 grid grid-cols-2 gap-2">
                  {#each perms as perm}
                    <label class="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        size="sm"
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
        </fieldset>

        <div class="modal-action">
          <Button variant="ghost" type="button" onclick={closeDialog} disabled={submitting}>
            {m.action_cancel()}
          </Button>
          <Button variant="primary" type="submit" disabled={submitting}>
            {#if submitting}
              <span class="loading loading-spinner loading-sm"></span>
            {/if}
            {editingRole ? m.action_save() : m.action_create()}
          </Button>
        </div>
      </form>
    </div>
    <form method="dialog" class="modal-backdrop fixed left-0 top-0 right-0 h-16">
      <button
        type="button"
        class="h-full w-full bg-black/50"
        onclick={() => closeDialog('backdrop')}
        aria-label={m.action_close()}
      >
        close
      </button>
    </form>
  </div>
{/if}
