<!--
  Admin Console - 权限管理页面（使用 CrudPage）
-->
<script lang='ts'>
  import type { CrudOperations } from '@h-ai/kit'
  import type { PageData } from './$types'
  import { createPermissionCrud } from '$lib/crud/permission-crud'
  import * as m from '$lib/paraglide/messages'
  import { CrudPage, usePermission } from '@h-ai/ui'

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

  const { data }: Props = $props()

  const { hasPerm } = usePermission()
  const canCreate = $derived(hasPerm('permission:create'))
  const canDelete = $derived(hasPerm('permission:delete'))

  const permissionCrud: CrudOperations = $derived(createPermissionCrud(data.permissionRolesMap))

  const crudData = $derived({
    items: data.permissions as unknown as Record<string, unknown>[],
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
      console.error(m.iam_permissions_system_cannot_delete())
      return false
    }
    return true
  }
</script>

<svelte:head>
  <title>{m.iam_permissions_title()} - {m.app_title()}</title>
</svelte:head>

<!-- 统计卡片 -->
<div class='grid gap-3 grid-cols-2 lg:grid-cols-4 mb-4'>
  <div class='bg-base-100 rounded-xl border border-base-content/6 p-4'>
    <p class='text-xs text-base-content/45'>{m.iam_permissions_stat_total()}</p>
    <p class='text-2xl font-bold text-primary mt-1 tabular-nums'>{data.total}</p>
  </div>
  <div class='bg-base-100 rounded-xl border border-base-content/6 p-4'>
    <p class='text-xs text-base-content/45'>{m.iam_permissions_stat_resources()}</p>
    <p class='text-2xl font-bold text-base-content mt-1 tabular-nums'>{data.resources.length}</p>
  </div>
  <div class='bg-base-100 rounded-xl border border-base-content/6 p-4'>
    <p class='text-xs text-base-content/45'>{m.iam_permissions_stat_actions()}</p>
    <p class='text-2xl font-bold text-base-content mt-1 tabular-nums'>{data.actions.length}</p>
  </div>
  <div class='bg-base-100 rounded-xl border border-base-content/6 p-4'>
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
/>
