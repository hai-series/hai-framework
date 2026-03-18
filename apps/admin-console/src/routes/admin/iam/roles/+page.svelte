<!--
  Admin Console - 角色管理页面（使用 CrudPage）
-->
<script lang='ts'>
  import type { CrudOperations } from '@h-ai/kit'
  import type { PageData } from './$types'
  import { createRoleCrud } from '$lib/crud/role-crud'
  import * as m from '$lib/paraglide/messages'
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
  const canCreate = $derived(hasPerm('role:create'))
  const canUpdate = $derived(hasPerm('role:update'))
  const canDelete = $derived(hasPerm('role:delete'))

  const roleCrud: CrudOperations = $derived(createRoleCrud())

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
      console.error(m.iam_roles_system_cannot_delete())
      return false
    }
    return true
  }
</script>

<svelte:head>
  <title>{m.iam_roles_title()} - {m.app_title()}</title>
</svelte:head>

<CrudPage
  crud={roleCrud}
  data={crudData}
  permissions={{ create: canCreate, update: canUpdate, delete: canDelete }}
  onbeforedelete={handleBeforeDelete}
>
  {#snippet editFormExtra(editingItem, _mode)}
    <!-- 权限树编辑器 -->
    <div>
      <p class='text-sm font-medium text-base-content mb-2'>{m.iam_roles_form_permissions()}</p>
      <div class='rounded-lg overflow-hidden max-h-64 overflow-y-auto bg-base-200/50'>
        {#each Object.entries(data.permissions) as [resource, perms]}
          <div class='border-b border-base-content/5 last:border-b-0'>
            <div class='flex items-center justify-between px-4 py-2 bg-base-200/50'>
              <span class='font-medium capitalize'>{resource}</span>
              <span class='text-xs text-base-content/50'>{perms.length}</span>
            </div>
            <div class='px-4 py-2 grid grid-cols-2 gap-2'>
              {#each perms as perm}
                <label class='flex items-center gap-2 cursor-pointer'>
                  <input type='checkbox' class='checkbox checkbox-sm' value={perm.code} disabled={editingItem?.isSystem === true} />
                  <span class='text-sm'>{perm.name}</span>
                </label>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/snippet}
</CrudPage>
