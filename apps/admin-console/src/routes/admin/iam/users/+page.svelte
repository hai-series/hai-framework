<!--
  Admin Console - 用户管理页面（使用 CrudPage）
-->
<script lang='ts'>
  import type { CrudOperations } from '@h-ai/kit'
  import type { PageData } from './$types'
  import { invalidateAll } from '$app/navigation'
  import { createUserCrud } from '$lib/crud/user-crud'
  import * as m from '$lib/paraglide/messages'
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
    }
  }

  const { data }: Props = $props()

  // 权限
  const { hasPerm } = usePermission()
  const canCreate = $derived(hasPerm('user:create'))
  const canUpdate = $derived(hasPerm('user:update'))
  const canDelete = $derived(hasPerm('user:delete'))

  // 创建 CRUD 定义（传入 roles 选项）
  const userCrud: CrudOperations = $derived(createUserCrud(data.roles))

  // 转换数据格式：roleIds 用于编辑，roles（名称数组）用于显示
  const crudData = $derived({
    items: data.users.map(u => ({
      ...u,
      roles: u.roles, // 列表中显示角色名
    })) as unknown as Record<string, unknown>[],
    total: data.total,
    page: data.page,
    pageSize: data.pageSize,
    filters: {
      search: data.search || undefined,
      status: data.status || undefined,
      role: data.role || undefined,
    },
  })

  // 提交前把 roles（显示名）替换为 roleIds（实际 ID）
  async function handleAfterSubmit() {
    await invalidateAll()
  }
</script>

<svelte:head>
  <title>{m.iam_users_title()} - {m.app_title()}</title>
</svelte:head>

<CrudPage
  crud={userCrud}
  data={crudData}
  permissions={{ create: canCreate, update: canUpdate, delete: canDelete }}
  onaftersubmit={handleAfterSubmit}
>
  {#snippet editFormExtra(_editingItem, _mode)}
    <!-- 密码字段是用户模块特有的，CrudPage 无法声明式处理，这里通过 snippet 注入 -->
    <!-- 注意：密码处理建议在后续迭代中通过专门的用户管理组件实现 -->
  {/snippet}
</CrudPage>
