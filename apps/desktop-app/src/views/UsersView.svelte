<!--
  UsersView — 分页列出用户，演示 `desktopApiClient.iam.users.list`。
  使用 @h-ai/ui 的 PageHeader / Card / DataTable / Pagination / Alert / Tag。
-->
<script lang='ts'>
  import { Alert, Card, DataTable, PageHeader, Pagination } from '@h-ai/ui'
  import { onMount } from 'svelte'
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

  const columns = $derived([
    { key: 'id', label: 'ID', width: '8rem' },
    { key: 'username', label: m('username') },
    { key: 'email', label: m('email') },
    {
      key: 'enabled',
      label: m('status'),
      align: 'center' as const,
      width: '6rem',
      render: (item: IamUser) => (item.enabled ? m('enabled') : m('disabled')),
    },
  ])

  async function fetchUsers(): Promise<void> {
    loading = true
    errorCode = null
    const result = await desktopApiClient.iam.users.list({ page, pageSize })
    if (result.success) {
      users = result.data.items
      total = result.data.total
    }
    else {
      errorCode = String(result.error.code ?? 'unknown')
    }
    loading = false
  }

  onMount(() => {
    void fetchUsers()
  })

  $effect(() => {
    void page
    void fetchUsers()
  })
</script>

<div class='flex flex-col gap-4'>
  <PageHeader title={m('nav_users')} description={m('users_total', { total })} />

  {#if errorCode}
    <Alert variant='error' title={m('users_failed')}>
      {errorCode}
    </Alert>
  {/if}

  <Card padding='none'>
    <DataTable
      data={users}
      {columns}
      keyField='id'
      {loading}
    />
  </Card>

  <div class='flex justify-center'>
    <Pagination bind:page {total} {pageSize} />
  </div>
</div>
