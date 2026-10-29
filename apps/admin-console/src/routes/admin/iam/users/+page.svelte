<!--
  Admin Console - 用户管理页面（使用 CrudPage）
-->
<script lang='ts'>
  import type { CrudOperations } from '@h-ai/kit'
  import type { PageData } from './$types'
  import { invalidateAll } from '$app/navigation'
  import InviteUserDialog from '$lib/components/InviteUserDialog.svelte'
  import { createUserCrud } from '$lib/crud/admin-crud'
  import * as m from '$lib/paraglide/messages'
  import { createSvelteKitNavAdapter } from '@h-ai/kit/client'
  import { Button, CrudPage, usePermission } from '@h-ai/ui'

  interface UserData {
    id: string
    username: string
    email: string
    display_name: string | null
    avatar: string | null
    accountStatus: 'active' | 'dormant' | 'closed'
    roles: string[]
    roleIds: string[]
    created_at: Date
    updated_at: Date
  }

  interface RoleData {
    id: string
    code: string
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
      accountStatus: string
      role: string
      sortBy: string
      sortDirection: string
    }
  }

  const { data }: Props = $props()
  let inviteOpen = $state(false)

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
      accountStatus: data.accountStatus || undefined,
      role: data.role || undefined,
      sortBy: data.sortBy || undefined,
      sortDirection: data.sortDirection || undefined,
    },
  })

  /** 用户列表后端实际支持的排序列；角色为当前页关联数据，不能伪装成服务端排序。 */
  const userSortableColumns = $derived([
    { key: 'username', label: m.iam_users_col_username() },
    { key: 'email', label: m.iam_users_col_email() },
    { key: 'accountStatus', label: m.account_state() },
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
  form={{ variant: 'drawer', drawerWidth: '44rem', columns: 2, labelPosition: 'left', labelWidth: '5.5rem' }}
  density='compact'
  detailColumns={['username']}
  sortableColumns={userSortableColumns}
  pagination={{ showSizeChanger: true, showJumper: true }}
  onaftersubmit={handleAfterSubmit}
  {nav}
>
  {#snippet toolbarActions()}
    {#if canCreate && data.iamPublicConfig.initialCredentials.enabled}<Button variant='outline' onclick={() => { inviteOpen = true }} data-testid='invite-user'>{m.invitation_title()}</Button>{/if}
  {/snippet}
</CrudPage>

<InviteUserDialog open={inviteOpen} mode={data.iamPublicConfig.passwordReset.mode} roles={data.roles} onclose={() => { inviteOpen = false }} onrefresh={handleAfterSubmit} />
