<!--
  UsersView — 分页列出用户，演示 `desktopApiClient.iam.users.list`。
  使用 @h-ai/ui 的 PageHeader / Card / DataTable / Pagination / Alert / Tag。
-->
<script lang='ts'>
  import { Card, DataTable, PageHeader, Pagination, TableToolbar } from '@h-ai/ui'
  import { useToastFeedback } from '@h-ai/ui/toast'
  import { desktopApiClient } from '../lib/api.js'
  import { desktopM as m } from '../lib/messages.svelte.js'

  type ListUsersResult = Extract<
    Awaited<ReturnType<typeof desktopApiClient.iam.users.list>>,
    { success: true }
  >['data']
  type IamUser = ListUsersResult['items'][number]

  let users = $state<IamUser[]>([])
  let total = $state(0)
  let loading = $state(false)
  let errorCode = $state<string | null>(null)
  let page = $state(1)
  const pageSize = 20
  let search = $state('')
  let appliedSearch = $state('')
  let sortKey = $state<'username' | 'email' | 'enabled'>('username')
  let sortDir = $state<'asc' | 'desc'>('asc')
  let requestVersion = 0
  let queryRevision = $state(0)

  const columns = $derived([
    { key: 'id', label: 'ID', width: '8rem' },
    { key: 'username', sortable: true, label: m('username') },
    { key: 'email', sortable: true, label: m('email') },
    {
      key: 'enabled',
      sortable: true,
      label: m('status'),
      align: 'center' as const,
      width: '6rem',
      render: (item: IamUser) => (item.enabled ? m('enabled') : m('disabled')),
    },
  ])

  async function fetchUsers(query: Parameters<typeof desktopApiClient.iam.users.list>[0]): Promise<void> {
    const version = ++requestVersion
    loading = true
    errorCode = null
    const result = await desktopApiClient.iam.users.list(query)
    if (version !== requestVersion)
      return
    if (result.success) {
      users = result.data.items
      total = result.data.total
    }
    else {
      errorCode = String(result.error.code ?? 'unknown')
    }
    loading = false
  }

  $effect(() => {
    void queryRevision
    void fetchUsers({ page, pageSize, search: appliedSearch || undefined, sortBy: sortKey, sortDirection: sortDir })
  })

  function sort(key: string, direction: 'asc' | 'desc') {
    const field = (['username', 'email', 'enabled'] as const).find(field => field === key)
    if (!field)
      return
    sortKey = field
    sortDir = direction
    page = 1
  }
  useToastFeedback(() => errorCode ? m('users_failed') : '')
</script>

<div class='flex min-h-0 flex-1 flex-col gap-4'>
  <PageHeader title={m('nav_users')} description={m('users_total', { total })} class='mb-0 shrink-0' />

  <Card padding='none' class='min-h-0 flex-1 overflow-hidden !shadow-none [&>.card-body]:min-h-0 [&>.card-body]:flex-1 [&>.card-body]:gap-0'>
    <TableToolbar class='shrink-0 border-b border-base-content/8 p-3' bind:searchValue={search} searchPlaceholder={m('users_search')} onsearch={(value) => {
      appliedSearch = value.trim()
      page = 1
      queryRevision++
    }} onclearfilters={() => {
      appliedSearch = ''
      sortKey = 'username'
      sortDir = 'asc'
      page = 1
      queryRevision++
    }} />
    <DataTable
      data={users}
      {columns}
      keyField='id'
      {loading}
      striped={false}
      {sortKey}
      {sortDir}
      onsort={sort}
      class='min-h-0 flex-1 overflow-auto'
    />
    <div class='mt-auto shrink-0 border-t border-base-content/8 px-3 py-2'><Pagination bind:page {total} {pageSize} showJumper /></div>
  </Card>
</div>
