<script lang='ts'>
  import type { PageData } from './$types'
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import * as m from '$lib/paraglide/messages.js'
  import { Alert, Badge, Button, Card, DataTable, FilterBar, Input, PageHeader, Pagination, Select } from '@h-ai/ui'
  import { SvelteURLSearchParams } from 'svelte/reactivity'

  const { data }: { data: PageData } = $props()

  let search = $state('')
  let status = $state('')

  const statusOptions = $derived([
    { value: '', label: m.admin_status_all() },
    { value: 'pending', label: m.admin_status_pending() },
    { value: 'contacted', label: m.admin_status_contacted() },
    { value: 'archived', label: m.admin_status_archived() },
  ])

  const statusVariantMap: Record<string, 'info' | 'success' | 'default'> = {
    pending: 'info',
    contacted: 'success',
    archived: 'default',
  }

  const emptyRouteParams = {}

  $effect(() => {
    search = data.search
    status = data.status
  })

  $effect(() => {
    if (data.loadError === 'Unauthorized') {
      const loginHref = resolve('/partners/admin/login', emptyRouteParams)
      void goto(loginHref)
    }
  })

  const columns = $derived([
    { key: 'created_at', label: m.admin_col_time(), sortable: true },
    { key: 'company_name', label: m.admin_col_company(), sortable: true },
    { key: 'contact_name', label: m.admin_col_contact(), sortable: true },
    { key: 'contact_info', label: m.admin_col_contact_info() },
    { key: 'cooperation_type', label: m.admin_col_type(), sortable: true },
    { key: 'budget_range', label: m.admin_col_budget(), sortable: true },
    { key: 'status', label: m.admin_col_status(), sortable: true },
  ])

  function navigate(overrides: Partial<Pick<PageData, 'page' | 'pageSize' | 'search' | 'status' | 'sortBy' | 'sortDirection'>>) {
    const values = { page: data.page, pageSize: data.pageSize, search: data.search, status: data.status, sortBy: data.sortBy, sortDirection: data.sortDirection, ...overrides }
    const params = new SvelteURLSearchParams()
    for (const [key, value] of Object.entries(values)) {
      if (value !== '')
        params.set(key, String(value))
    }
    void goto(resolve(`/partners/admin?${params}`, emptyRouteParams), { keepFocus: true, noScroll: true, invalidateAll: true })
  }

  function handleFilter(event: SubmitEvent) {
    event.preventDefault()
    navigate({ page: 1, search: search.trim(), status })
  }

  function sort(key: string, direction: 'asc' | 'desc') {
    const field = (['created_at', 'company_name', 'contact_name', 'cooperation_type', 'budget_range', 'status'] as const).find(field => field === key)
    if (field)
      navigate({ page: 1, sortBy: field, sortDirection: direction })
  }

  async function handleLogout() {
    await fetch('/api/partners/admin/logout', { method: 'POST' })
    const loginHref = resolve('/partners/admin/login', emptyRouteParams)
    await goto(loginHref)
  }

</script>

<svelte:head>
  <title>{m.nav_partner_admin()} - {m.brand()}</title>
</svelte:head>

<section class='flex h-[calc(100dvh-4rem)] min-h-0 min-w-0 flex-col gap-3 px-4 py-4 lg:px-6'>
  <div class='flex shrink-0 items-center justify-between gap-3'>
    <PageHeader title={m.nav_partner_admin()} description={m.admin_records_total({ total: String(data.total) })} class='mb-0' />
    <Button variant='default' size='sm' outline onclick={handleLogout}><span class='icon-[tabler--logout] size-4'></span>{m.admin_logout()}</Button>
  </div>
  <Card padding='none' shadow={false} class='flex min-h-0 flex-1 flex-col overflow-hidden [&>.card-body]:min-h-0 [&>.card-body]:flex-1 [&>.card-body]:gap-0'>
    <form class='shrink-0 border-b border-base-content/8 p-3' onsubmit={handleFilter}>
      <FilterBar activeCount={status ? 1 : 0} onreset={() => {
        search = ''
        status = ''
        navigate({ page: 1, search: '', status: '', sortBy: 'created_at', sortDirection: 'desc' })
      }} data-testid='partner-filters'>
        {#snippet leading()}<Input type='search' size='sm' placeholder={m.admin_search_placeholder()} bind:value={search} data-testid='partner-search' />{/snippet}
        {#snippet actions()}<Button type='submit' submitHint size='sm' variant='outline'>{m.admin_search_button()}</Button>{/snippet}
        <div class='w-full sm:w-56'><Select size='sm' options={statusOptions} bind:value={status} /></div>
      </FilterBar>
    </form>
    {#if data.loadError}<Alert variant='error'>{data.loadError}</Alert>{/if}
    <DataTable data={data.records} {columns} keyField='id' striped={false} sortKey={data.sortBy} sortDir={data.sortDirection} onsort={sort} class='min-h-0 min-w-0 flex-1 overflow-auto'>
      {#snippet cell(item, key)}
        {#if key === 'contact_info'}<div class='text-xs leading-5'><div>{String(item.phone ?? '')}</div><div class='text-base-content/60'>{String(item.email ?? '')}</div></div>
        {:else if key === 'status'}<Badge variant={statusVariantMap[String(item.status ?? '')] ?? 'default'} outline>{String(item.status ?? '')}</Badge>
        {:else}{String(item[key] ?? '')}{/if}
      {/snippet}
    </DataTable>
    <div class='mt-auto shrink-0 border-t border-base-content/8 px-3 py-2'><Pagination page={data.page} total={data.total} pageSize={data.pageSize} showSizeChanger showJumper onchange={page => navigate({ page })} onpagesizechange={pageSize => navigate({ page: 1, pageSize })} /></div>
  </Card>
</section>
