<!--
  Admin Console - 角色管理页面
-->
<script lang="ts">
  import type { PageData } from './$types'
  import { goto, invalidateAll } from '$app/navigation'
  import * as m from '$lib/paraglide/messages'
  import { apiFetch } from '$lib/utils/api'
  import { usePermission } from '@h-ai/ui'

  interface RoleData {
    id: string
    name: string
    description?: string | null
    permissions: string[]
    userCount: number
    isSystem: boolean
  }

  interface PermissionItem {
    code: string
    name: string
  }

  type PermissionsByResource = Record<string, PermissionItem[]>

  interface Props {
    data: PageData & {
      roles: RoleData[]
      total: number
      page: number
      pageSize: number
      permissions: PermissionsByResource
      search: string
    }
  }

  let { data }: Props = $props()

  // ─── 权限判断（使用上下文） ───
  const { hasPerm } = usePermission()

  const canCreate = $derived(hasPerm('role:create'))
  const canUpdate = $derived(hasPerm('role:update'))
  const canDelete = $derived(hasPerm('role:delete'))

  /** 权限 code → name 映射，用于将 code 显示为可读名称 */
  const permNameMap = $derived.by(() => {
    const map: Record<string, string> = {}
    for (const perms of Object.values(data.permissions)) {
      for (const p of perms) {
        map[p.code] = p.name
      }
    }
    return map
  })

  /** 搜索关键字 */
  let searchQuery = $state('')

  /** 搜索防抖定时器 */
  let searchTimer: ReturnType<typeof setTimeout> | undefined

  /** 当 data 更新时同步本地筛选状态 */
  $effect(() => {
    searchQuery = data.search
  })

  /** 构建带查询参数的 URL 并导航 */
  function navigateWithParams(overrides: Record<string, string | number>) {
    const params = new URLSearchParams()
    const merged = {
      search: searchQuery,
      page: data.page,
      pageSize: data.pageSize,
      ...overrides,
    }
    if (merged.search) params.set('search', String(merged.search))
    if (merged.page && merged.page !== 1) params.set('page', String(merged.page))
    if (merged.pageSize && merged.pageSize !== 20) params.set('pageSize', String(merged.pageSize))
    const qs = params.toString()
    goto(`/admin/iam/roles${qs ? `?${qs}` : ''}`, { invalidateAll: true })
  }

  /** 搜索输入防抖 */
  function handleSearchInput() {
    clearTimeout(searchTimer)
    searchTimer = setTimeout(() => {
      navigateWithParams({ search: searchQuery, page: 1 })
    }, 400)
  }

  /** 分页变更 */
  function handlePageChange(newPage: number) {
    navigateWithParams({ page: newPage })
  }

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
  function togglePermission(permCode: string) {
    if (form.permissions.includes(permCode)) {
      form.permissions = form.permissions.filter((p) => p !== permCode)
    } else {
      form.permissions = [...form.permissions, permCode]
    }
  }

  /** 切换资源组所有权限 */
  function toggleResourcePermissions(resource: string, permissions: PermissionItem[]) {
    const permCodes = permissions.map((p) => p.code)
    const allSelected = permCodes.every((p) => form.permissions.includes(p))

    if (allSelected) {
      form.permissions = form.permissions.filter((p) => !permCodes.includes(p))
    } else {
      form.permissions = [...new Set([...form.permissions, ...permCodes])]
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

      const response = await apiFetch(url, {
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
        await invalidateAll()
      } else {
        error = result.error?.message || m.iam_roles_operation_failed()
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
      const response = await apiFetch(`/api/iam/roles/${role.id}`, {
        method: 'DELETE',
      })

      const result = await response.json()

      if (result.success) {
        await invalidateAll()
      } else {
        alert(result.error?.message || m.iam_roles_delete_failed())
      }
    } catch (e) {
      alert(m.common_network_error())
    }
  }
</script>

<svelte:head>
  <title>{m.iam_roles_title()} - {m.app_title()}</title>
</svelte:head>

<div class="space-y-4">
  <!-- 页面标题 -->
  <PageHeader title={m.iam_roles_title()} description={m.iam_roles_subtitle()}>
    {#snippet actions()}
      {#if canCreate}
        <Button variant="primary" class="gap-2" onclick={openCreateDialog}>
          <span class="icon-[tabler--plus] size-4.5"></span>
          {m.iam_roles_create()}
        </Button>
      {/if}
    {/snippet}
  </PageHeader>

  <!-- 搜索栏 -->
  <Card>
    <div class="p-4">
      <div class="relative flex-1">
        <span class="icon-[tabler--search] size-4.5 absolute left-3 top-1/2 -translate-y-1/2 text-base-content/35 z-10"></span>
        <Input
          type="text"
          placeholder={m.iam_roles_search_placeholder()}
          class="pl-10"
          bind:value={searchQuery}
          oninput={handleSearchInput}
          autocomplete="off"
        />
      </div>
    </div>
  </Card>

  <!-- 角色列表 -->
  <div class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
    {#each data.roles as role}
      <div class="card bg-base-100 border border-base-content/6 rounded-xl">
        <div class="card-body p-4">
          <div class="flex items-start justify-between">
            <div>
              <h3 class="card-title text-sm font-semibold">
                {role.name}
                {#if role.isSystem}
                  <Badge variant="default" size="sm" outline>{m.iam_roles_type_system()}</Badge>
                {/if}
              </h3>
              {#if role.description}
                <p class="text-xs text-base-content/45 mt-0.5">{role.description}</p>
              {/if}
            </div>
            {#if canUpdate || canDelete}
            <div class="dropdown dropdown-end">
              <IconButton variant="ghost" size="sm" ariaLabel={m.iam_roles_action_menu()}>
                <span class="icon-[tabler--dots-vertical] size-5"></span>
              </IconButton>
              <ul class="dropdown-content menu bg-base-100 rounded-xl shadow-lg border border-base-content/6 w-40 p-1.5 z-10">
                {#if canUpdate}
                  <li>
                    <Button variant="ghost" class="justify-start" onclick={() => openEditDialog(role)}>
                      <span class="icon-[tabler--edit] size-4"></span>
                      {m.action_edit()}
                    </Button>
                  </li>
                {/if}
                {#if canDelete && !role.isSystem}
                  <li>
                    <Button variant="ghost" class="justify-start text-error" onclick={() => handleDelete(role)}>
                      <span class="icon-[tabler--trash] size-4"></span>
                      {m.action_delete()}
                    </Button>
                  </li>
                {/if}
              </ul>
            </div>
            {/if}
          </div>

          <div class="divider my-2"></div>

          <div class="flex items-center justify-between text-sm">
            <span class="text-base-content/60">
              <span class="icon-[tabler--users] size-4 inline-block align-middle mr-1"></span>
              {m.iam_roles_user_count({ count: role.userCount })}
            </span>
            <span class="text-base-content/60">
              <span class="icon-[tabler--key] size-4 inline-block align-middle mr-1"></span>
              {m.iam_roles_permission_count({ count: role.permissions.length })}
            </span>
          </div>

          {#if role.permissions.length > 0}
            <div class="flex flex-wrap gap-1 mt-2">
              {#each role.permissions.slice(0, 5) as perm}
                <Badge variant="ghost" size="sm">{permNameMap[perm] ?? perm}</Badge>
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

  <!-- 分页 -->
  {#if data.total > data.pageSize}
    <div class="flex justify-center">
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
            <span class="icon-[tabler--alert-circle] size-5"></span>
            <span>{error}</span>
          </div>
        {/if}

        <div class="fieldset">
          <legend class="fieldset-legend">{m.iam_roles_form_name()} <span class="text-error">*</span></legend>
          <Input
            type="text"
            id="name"
            bind:value={form.name}
            required
            disabled={submitting || Boolean(editingRole?.isSystem)}
            placeholder={m.iam_roles_form_name_placeholder()}
          />
        </div>

        <div class="fieldset">
          <legend class="fieldset-legend">{m.iam_roles_form_description()}</legend>
          <Textarea
            id="description"
            bind:value={form.description}
            disabled={submitting}
            placeholder={m.iam_roles_form_description_placeholder()}
            rows={2}
          />
        </div>

        <fieldset class="fieldset">
          <legend class="fieldset-legend flex items-center justify-between w-full">
            <span>{m.iam_roles_form_permissions()}</span>
            <span class="fieldset-label text-base-content/60">
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
                  disabled={editingRole?.isSystem}
                >
                  <span class="font-medium capitalize">{resource}</span>
                  <Checkbox
                    size="sm"
                    checked={perms.every((p) => form.permissions.includes(p.code))}
                    readonly
                  />
                </BareButton>
                <div class="px-4 py-2 grid grid-cols-2 gap-2">
                  {#each perms as perm}
                    <label class="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        size="sm"
                        checked={form.permissions.includes(perm.code)}
                        onchange={() => togglePermission(perm.code)}
                        disabled={submitting || editingRole?.isSystem}
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
          <Button variant="ghost" type="button" onclick={() => closeDialog()} disabled={submitting}>
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
