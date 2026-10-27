<!--
  Admin Console - 权限管理页面（使用 CrudPage）
-->
<script lang='ts'>
  import type { CrudOperations } from '@h-ai/kit'
  import type { PageData } from './$types'
  import { invalidateAll } from '$app/navigation'
  import { createPermissionCrud } from '$lib/crud/admin-crud'
  import * as m from '$lib/paraglide/messages'
  import { sensitiveFetch } from '$lib/services/sensitive-actions.svelte'
  import { err, HaiCommonError, ok } from '@h-ai/core'
  import { createSvelteKitNavAdapter } from '@h-ai/kit/client'
  import { Button, CrudPage, Modal, SensitiveOperationsForm, usePermission } from '@h-ai/ui'

  interface PermissionItem {
    id: string
    code: string
    name: string
    description?: string | null
    resource?: string
    action?: string
    type?: 'menu' | 'api' | 'button'
    is_system: boolean
    sensitiveOperations?: string[] | null
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

  const { data }: Props = $props()

  const { hasPerm } = usePermission()
  const canCreate = $derived(hasPerm('permission:create') && hasPerm('permission:api:create'))
  const canDelete = $derived(hasPerm('permission:delete') && hasPerm('permission:api:delete'))

  const permissionCrud: CrudOperations = $derived(createPermissionCrud(data.permissionRolesMap))

  const crudData = $derived({
    items: data.permissions.map(permission => ({ ...permission })),
    total: data.total,
    page: data.page,
    pageSize: data.pageSize,
    filters: {
      search: data.search || undefined,
      type: data.type || undefined,
    },
  })

  function handleBeforeDelete(item: Record<string, unknown>) {
    if (item.is_system) {
      return false
    }
    return true
  }

  const nav = createSvelteKitNavAdapter()
  let editing = $state<PermissionItem | null>(null)

  async function saveOperations(operations: string[]) {
    if (!editing)
      return err(HaiCommonError.VALIDATION_ERROR)
    const response = await sensitiveFetch('iam.permissions.sensitiveOperations', `/api/iam/permissions/${encodeURIComponent(editing.id)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sensitiveOperations: operations }) })
    if (!response.ok)
      return err(HaiCommonError.INTERNAL_ERROR)
    await invalidateAll()
    return ok(undefined)
  }
</script>

<svelte:head>
  <title>{m.iam_permissions_title()} - {m.app_title()}</title>
</svelte:head>

<!-- 统计卡片 -->
<div class='grid gap-3 grid-cols-2 lg:grid-cols-4 mb-4'>
  <div class='bg-base-100 rounded-xl border border-base-content/6 p-4 shadow-sm'>
    <p class='text-xs text-base-content/45'>{m.iam_permissions_stat_total()}</p>
    <p class='text-2xl font-bold text-primary mt-1 tabular-nums'>{data.total}</p>
  </div>
  <div class='bg-base-100 rounded-xl border border-base-content/6 p-4 shadow-sm'>
    <p class='text-xs text-base-content/45'>{m.iam_permissions_stat_resources()}</p>
    <p class='text-2xl font-bold text-base-content mt-1 tabular-nums'>{data.resources.length}</p>
  </div>
  <div class='bg-base-100 rounded-xl border border-base-content/6 p-4 shadow-sm'>
    <p class='text-xs text-base-content/45'>{m.iam_permissions_stat_actions()}</p>
    <p class='text-2xl font-bold text-base-content mt-1 tabular-nums'>{data.actions.length}</p>
  </div>
  <div class='bg-base-100 rounded-xl border border-base-content/6 p-4 shadow-sm'>
    <p class='text-xs text-base-content/45'>{m.iam_permissions_stat_system()}</p>
    <p class='text-2xl font-bold text-secondary mt-1 tabular-nums'>
      {data.permissions.filter(p => p.is_system).length}
    </p>
  </div>
</div>

<CrudPage
  crud={permissionCrud}
  data={crudData}
  permissions={{ create: canCreate, update: false, delete: canDelete }}
  onbeforedelete={handleBeforeDelete}
  {nav}
>
  {#snippet listItemActions(item)}
    {#if data.iamPublicConfig.reauthentication.enabled && hasPerm('permission:manage')}
      <Button size='xs' variant='ghost' onclick={() => { editing = data.permissions.find(permission => permission.id === item.id) ?? null }}>{m.security_sensitive_operations()}</Button>
    {/if}
  {/snippet}
</CrudPage>

<Modal open={!!editing} title={m.security_sensitive_operations()} onclose={() => { editing = null }}>
  {#if editing}
    {#key editing.id}
      <p class='mb-3 text-sm font-medium'>{editing.code}</p>
      <SensitiveOperationsForm operations={editing.sensitiveOperations ?? []} onsubmit={saveOperations} ondone={() => { editing = null }} />
    {/key}
  {/if}
</Modal>
