<!--
  Admin Console - 权限管理页面
  支持分页、按类型筛选、搜索
-->
<script lang="ts">
  import * as m from '$lib/paraglide/messages'
  import { goto, invalidateAll } from '$app/navigation'
  import type { PageData } from './$types'
  import { apiFetch } from '$lib/utils/api'
  import { usePermission } from '@h-ai/ui'

  interface PermissionItem {
    id: string
    code: string
    name: string
    description?: string | null
    resource?: string
    action?: string
    type?: 'menu' | 'api' | 'button'
    is_system: boolean
  }

  interface Props {
    data: PageData & {
      permissions: PermissionItem[]
      total: number
      page: number
      pageSize: number
      permissionRolesMap: Record<string, string[]>
      resources: string[]
      actions: string[]
      search: string
      type: string
    }
  }

  let { data }: Props = $props()

  // ─── 权限判断（使用上下文） ───
  const { hasPerm } = usePermission()

  const canCreate = $derived(hasPerm('permission:create'))
  const canDelete = $derived(hasPerm('permission:delete'))

  /** 搜索关键字 */
  let searchQuery = $state('')

  /** 类型筛选 */
  let typeFilter = $state('')

  /** 搜索防抖定时器 */
  let searchTimer: ReturnType<typeof setTimeout> | undefined

  /** 当 data 更新时同步本地筛选状态 */
  $effect(() => {
    searchQuery = data.search
    typeFilter = data.type
  })

  /** 构建带查询参数的 URL 并导航 */
  function navigateWithParams(overrides: Record<string, string | number>) {
    const params = new URLSearchParams()
    const merged = {
      search: searchQuery,
      type: typeFilter,
      page: data.page,
      pageSize: data.pageSize,
      ...overrides,
    }
    if (merged.search) params.set('search', String(merged.search))
    if (merged.type) params.set('type', String(merged.type))
    if (merged.page && merged.page !== 1) params.set('page', String(merged.page))
    if (merged.pageSize && merged.pageSize !== 20) params.set('pageSize', String(merged.pageSize))
    const qs = params.toString()
    goto(`/admin/iam/permissions${qs ? `?${qs}` : ''}`, { invalidateAll: true })
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

  /** 新建对话框状态 */
  let showDialog = $state(false)

  /** 表单数据 */
  let form = $state({
    name: '',
    description: '',
    type: 'api' as 'menu' | 'button' | 'api',
    resource: '',
    action: '',
  })

  /** 提交中状态 */
  let submitting = $state(false)
  let error = $state('')

  /** 获取权限关联角色 */
  function getRoles(permCode: string): string[] {
    return data.permissionRolesMap[permCode] ?? []
  }

  /** 打开新建对话框 */
  function openCreateDialog() {
    form = {
      name: '',
      description: '',
      type: 'api',
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
      const response = await apiFetch('/api/iam/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      const result = await response.json()

      if (result.success) {
        closeDialog()
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
      const response = await apiFetch(`/api/iam/permissions/${perm.id}`, {
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
</script>

<svelte:head>
  <title>{m.iam_permissions_title()} - {m.app_title()}</title>
</svelte:head>

<div class="space-y-4">
  <!-- 页面标题 -->
  <PageHeader title={m.iam_permissions_title()} description={m.iam_permissions_subtitle()}>
    {#snippet actions()}
      {#if canCreate}
        <Button variant="primary" class="gap-2" onclick={openCreateDialog}>
          <span class="icon-[tabler--plus] size-4.5"></span>
          {m.iam_permissions_create()}
        </Button>
      {/if}
    {/snippet}
  </PageHeader>

  <!-- 统计卡片 -->
  <div class="grid gap-3 grid-cols-2 lg:grid-cols-4">
    <div class="bg-base-100 rounded-xl border border-base-content/6 p-4">
      <p class="text-xs text-base-content/45">{m.iam_permissions_stat_total()}</p>
      <p class="text-2xl font-bold text-primary mt-1 tabular-nums">{data.total}</p>
    </div>
    <div class="bg-base-100 rounded-xl border border-base-content/6 p-4">
      <p class="text-xs text-base-content/45">{m.iam_permissions_stat_resources()}</p>
      <p class="text-2xl font-bold text-base-content mt-1 tabular-nums">{data.resources.length}</p>
    </div>
    <div class="bg-base-100 rounded-xl border border-base-content/6 p-4">
      <p class="text-xs text-base-content/45">{m.iam_permissions_stat_actions()}</p>
      <p class="text-2xl font-bold text-base-content mt-1 tabular-nums">{data.actions.length}</p>
    </div>
    <div class="bg-base-100 rounded-xl border border-base-content/6 p-4">
      <p class="text-xs text-base-content/45">{m.iam_permissions_stat_system()}</p>
      <p class="text-2xl font-bold text-secondary mt-1 tabular-nums">
        {data.permissions.filter((p) => p.is_system).length}
      </p>
    </div>
  </div>

  <!-- 搜索栏 -->
  <Card>
    <div class="p-4 flex flex-col sm:flex-row gap-3">
      <div class="relative flex-1">
        <span class="icon-[tabler--search] size-4.5 absolute left-3 top-1/2 -translate-y-1/2 text-base-content/35 z-10"></span>
        <Input
          type="text"
          placeholder={m.iam_permissions_search_placeholder()}
          class="pl-10"
          bind:value={searchQuery}
          oninput={handleSearchInput}
          autocomplete="off"
        />
      </div>
      <Select
        size="md"
        class="w-full sm:w-40"
        bind:value={typeFilter}
        onchange={() => navigateWithParams({ type: typeFilter, page: 1 })}
      >
        <option value="">{m.iam_permissions_filter_all_types()}</option>
        <option value="menu">{m.iam_permissions_type_menu()}</option>
        <option value="button">{m.iam_permissions_type_button()}</option>
        <option value="api">{m.iam_permissions_type_api()}</option>
      </Select>
    </div>
  </Card>

  <!-- 权限列表（扁平分页） -->
  <Card>
    <div class="overflow-x-auto">
      <table class="w-full text-[13px]">
        <thead>
          <tr class="border-b border-base-content/6">
            <th class="px-4 py-3 text-left text-xs font-semibold text-base-content/50 uppercase tracking-wider">{m.iam_permissions_col_name()}</th>
            <th class="px-4 py-3 text-left text-xs font-semibold text-base-content/50 uppercase tracking-wider">{m.iam_permissions_col_code()}</th>
            <th class="px-4 py-3 text-left text-xs font-semibold text-base-content/50 uppercase tracking-wider">{m.iam_permissions_form_action()}</th>
            <th class="px-4 py-3 text-left text-xs font-semibold text-base-content/50 uppercase tracking-wider">{m.iam_permissions_col_description()}</th>
            <th class="px-4 py-3 text-left text-xs font-semibold text-base-content/50 uppercase tracking-wider">{m.iam_permissions_col_type()}</th>
            <th class="px-4 py-3 text-left text-xs font-semibold text-base-content/50 uppercase tracking-wider">{m.iam_permissions_col_roles()}</th>
            {#if canDelete}
              <th class="px-4 py-3 text-right text-xs font-semibold text-base-content/50 uppercase tracking-wider">{m.iam_permissions_col_actions()}</th>
            {/if}
          </tr>
        </thead>
        <tbody class="divide-y divide-base-content/5">
          {#each data.permissions as perm}
            {@const linkedRoles = getRoles(perm.code)}
            <tr class="hover:bg-base-200/30 transition-colors">
              <td class="px-4 py-3 font-medium text-base-content">{perm.name}</td>
              <td class="px-4 py-3">
                <code class="text-xs bg-base-content/5 px-1.5 py-0.5 rounded font-mono">{perm.code}</code>
              </td>
              <td class="px-4 py-3">
                {#if perm.action}
                  <Badge size="sm" outline>{perm.action}</Badge>
                {:else}
                  <span class="text-base-content/30">-</span>
                {/if}
              </td>
              <td class="px-4 py-3 text-base-content/60 text-sm max-w-48 truncate">
                {perm.description ?? '-'}
              </td>
              <td class="px-4 py-3">
                {#if perm.type === 'menu'}
                  <Badge variant="primary" size="sm">{m.iam_permissions_type_menu()}</Badge>
                {:else if perm.type === 'button'}
                  <Badge variant="warning" size="sm">{m.iam_permissions_type_button()}</Badge>
                {:else}
                  <Badge variant="ghost" size="sm">{m.iam_permissions_type_api()}</Badge>
                {/if}
                {#if perm.is_system}
                  <Badge variant="secondary" size="sm" class="ml-1">{m.iam_permissions_type_system()}</Badge>
                {/if}
              </td>
              <td class="px-4 py-3">
                {#if linkedRoles.length > 0}
                  <div class="flex flex-wrap gap-1">
                    {#each linkedRoles.slice(0, 3) as roleName}
                      <Badge variant="ghost" size="sm">{roleName}</Badge>
                    {/each}
                    {#if linkedRoles.length > 3}
                      <Badge variant="ghost" size="sm">+{linkedRoles.length - 3}</Badge>
                    {/if}
                  </div>
                {:else}
                  <span class="text-xs text-base-content/30">{m.iam_permissions_no_roles()}</span>
                {/if}
              </td>
              {#if canDelete}
                <td class="px-4 py-3 text-right">
                  {#if !perm.is_system}
                    <IconButton
                      size="xs"
                      class="btn-ghost text-error"
                      ariaLabel={m.action_delete()}
                      onclick={() => handleDelete(perm)}
                    >
                      <span class="icon-[tabler--trash] size-3.5"></span>
                    </IconButton>
                  {/if}
                </td>
              {/if}
            </tr>
          {:else}
            <tr>
              <td colspan="7" class="p-8 text-center text-base-content/30">
                <span class="icon-[tabler--key] size-12 mx-auto text-base-content/15 block mb-3"></span>
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

<!-- 新建对话框 -->
<Modal open={showDialog} onclose={closeDialog} title={m.iam_permissions_create()} size="lg">
  <form onsubmit={handleSubmit} class="space-y-4">
    {#if error}
      <div class="alert alert-error">
        <span class="icon-[tabler--alert-circle] size-5"></span>
        <span>{error}</span>
      </div>
    {/if}

    <div class="fieldset">
      <legend class="fieldset-legend">{m.iam_permissions_form_type()} <span class="text-error">*</span></legend>
      <Select
        id="type"
        bind:value={form.type}
        disabled={submitting}
      >
        <option value="api">{m.iam_permissions_type_api()}</option>
        <option value="menu">{m.iam_permissions_type_menu()}</option>
        <option value="button">{m.iam_permissions_type_button()}</option>
      </Select>
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div class="fieldset">
        <legend class="fieldset-legend">{m.iam_permissions_form_resource()} <span class="text-error">*</span></legend>
        <Input
          type="text"
          id="resource"
          bind:value={form.resource}
          oninput={updatePermissionName}
          required
          disabled={submitting}
          placeholder={form.type === 'menu' ? 'menu' : form.type === 'button' ? 'btn' : m.iam_permissions_form_resource_placeholder()}
          list="resources"
        />
        <datalist id="resources">
          {#each data.resources as res}
            <option value={res}></option>
          {/each}
        </datalist>
      </div>

      <div class="fieldset">
        <legend class="fieldset-legend">{m.iam_permissions_form_action()} <span class="text-error">*</span></legend>
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

    <div class="fieldset">
      <legend class="fieldset-legend">{m.iam_permissions_form_name()} <span class="text-error">*</span></legend>
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

    <div class="fieldset">
      <legend class="fieldset-legend">{m.iam_permissions_form_description()}</legend>
      <Textarea
        id="description"
        bind:value={form.description}
        disabled={submitting}
        placeholder={m.iam_permissions_form_description_placeholder()}
        rows={2}
      />
    </div>

    <div class="modal-action relative z-10">
      <Button class="btn-ghost" onclick={closeDialog} disabled={submitting}>
        {m.action_cancel()}
      </Button>
      <Button variant="primary" type="submit" disabled={submitting} loading={submitting}>
        {m.action_create()}
      </Button>
    </div>
  </form>
</Modal>
