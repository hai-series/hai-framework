<!--
  Admin Console - 用户管理页面（使用 CrudPage）
-->
<script lang='ts'>
  import type { CrudOperations } from '@h-ai/kit'
  import type { PageData } from './$types'
  import { invalidateAll } from '$app/navigation'
  import { createUserCrud } from '$lib/crud/admin-crud'
  import * as m from '$lib/paraglide/messages'
  import { createSvelteKitNavAdapter } from '@h-ai/kit/client'
  import { CrudPage, usePermission } from '@h-ai/ui'

  interface UserData {
    id: string
    username: string
    email: string
    display_name: string | null
    avatar: string | null
    status: 'active' | 'inactive' | 'suspended'
    roles: string[]
    roleIds: string[]
    created_at: Date
    updated_at: Date
  }

  interface RoleData {
    id: string
    name: string
  }

  interface Props {
    data: PageData & {
      users: UserData[]
      roles: RoleData[]
      total: number
      page: number
      pageSize: number
      search: string
      status: string
      role: string
      sortBy: string
      sortDirection: string
    }
  }

  const { data }: Props = $props()

  // 权限
  const { hasPerm } = usePermission()
  const canCreate = $derived(hasPerm('user:create') && hasPerm('user:api:create'))
  const canUpdate = $derived(hasPerm('user:update') && hasPerm('user:api:update'))
  const canDelete = $derived(hasPerm('user:delete') && hasPerm('user:api:delete'))

  // 创建 CRUD 定义（传入 roles 选项）
  const userCrud: CrudOperations = $derived(createUserCrud(data.roles))

  // 转换数据格式：roleIds 用于编辑，roles（名称数组）用于显示
  const crudData = $derived({
    items: data.users.map(u => ({
      ...u,
      roleNames: u.roles,
      roles: u.roleIds,
    })),
    total: data.total,
    page: data.page,
    pageSize: data.pageSize,
    filters: {
      search: data.search || undefined,
      status: data.status || undefined,
      role: data.role || undefined,
      sortBy: data.sortBy || undefined,
      sortDirection: data.sortDirection || undefined,
    },
  })

  /** 用户列表后端实际支持的排序列；角色为当前页关联数据，不能伪装成服务端排序。 */
  const userSortableColumns = $derived([
    { key: 'username', label: m.iam_users_col_username() },
    { key: 'email', label: m.iam_users_col_email() },
    { key: 'status', label: m.iam_users_col_status() },
    { key: 'created_at', label: m.iam_users_col_created_at() },
  ])

  // 提交前把 roles（显示名）替换为 roleIds（实际 ID）
  async function handleAfterSubmit() {
    await invalidateAll()
  }

  const nav = createSvelteKitNavAdapter()
</script>

<svelte:head>
  <title>{m.iam_users_title()} - {m.app_title()}</title>
</svelte:head>

<CrudPage
  crud={userCrud}
  data={crudData}
  permissions={{ create: canCreate, update: canUpdate, delete: canDelete }}
  form={{ variant: 'drawer', drawerWidth: '40rem' }}
  density='compact'
  sortableColumns={userSortableColumns}
  pagination={{ showSizeChanger: true, showJumper: true }}
  onaftersubmit={handleAfterSubmit}
  {nav}
>
  {#snippet editFormExtra(_editingItem, _mode)}
    <!-- 密码字段是用户模块特有的，CrudPage 无法声明式处理，这里通过 snippet 注入 -->
    <!-- 注意：密码处理建议在后续迭代中通过专门的用户管理组件实现 -->
  {/snippet}
</CrudPage>
