<!--
  Admin Console - 角色管理页面（使用 CrudPage）
-->
<script lang='ts'>
  import type { CrudOperations } from '@h-ai/kit'
  import type { PageData } from './$types'
  import { createRoleCrud } from '$lib/crud/role-crud'
  import * as m from '$lib/paraglide/messages'
  import { createSvelteKitNavAdapter } from '@h-ai/kit/client'
  import { CrudPage, usePermission } from '@h-ai/ui'

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

  const { data }: Props = $props()

  const { hasPerm } = usePermission()
  const canCreate = $derived(hasPerm('role:create') && hasPerm('role:api:create'))
  const canUpdate = $derived(hasPerm('role:update') && hasPerm('role:api:update'))
  const canDelete = $derived(hasPerm('role:delete') && hasPerm('role:api:delete'))

  const roleCrud: CrudOperations = $derived(createRoleCrud(data.permissions))

  const crudData = $derived({
    items: data.roles as unknown as Record<string, unknown>[],
    total: data.total,
    page: data.page,
    pageSize: data.pageSize,
    filters: {
      search: data.search || undefined,
    },
  })

  function handleBeforeDelete(item: Record<string, unknown>) {
    if (item.isSystem) {
      return false
    }
    return true
  }

  const nav = createSvelteKitNavAdapter()
</script>

<svelte:head>
  <title>{m.iam_roles_title()} - {m.app_title()}</title>
</svelte:head>

<CrudPage
  crud={roleCrud}
  data={crudData}
  permissions={{ create: canCreate, update: canUpdate, delete: canDelete }}
  onbeforedelete={handleBeforeDelete}
  {nav}
/>
