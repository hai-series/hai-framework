<script lang="ts">
  import { goto } from '$app/navigation'
  import { Badge, Button, Input, Select } from '@h-ai/ui'
  import * as m from '$lib/paraglide/messages.js'

  interface Props {
    data: {
      records: Array<Record<string, unknown>>
      total: number
      page: number
      pageSize: number
      search: string
      status: string
      loadError: string
    }
  }

  let { data }: Props = $props()

  let search = $state('')
  let status = $state('')
  const totalPages = $derived(Math.max(1, Math.ceil(data.total / data.pageSize)))

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

  $effect(() => {
    search = data.search
    status = data.status
  })

  async function handleFilter(event: Event) {
    event.preventDefault()
    const params = new URLSearchParams()
    params.set('page', '1')
    params.set('pageSize', String(data.pageSize))
    if (search.trim()) params.set('search', search.trim())
    if (status) params.set('status', status)

    await goto(`/partners/admin?${params.toString()}`)
  }

  async function handleLogout() {
    await fetch('/api/partners/admin/logout', { method: 'POST' })
    await goto('/partners/admin/login')
  }

  function navigatePage(nextPage: number) {
    const params = new URLSearchParams()
    params.set('page', String(nextPage))
    params.set('pageSize', String(data.pageSize))
    if (search.trim()) params.set('search', search.trim())
    if (status) params.set('status', status)
    void goto(`/partners/admin?${params.toString()}`)
  }
</script>

<svelte:head>
  <title>{m.nav_partner_admin()} - {m.brand()}</title>
</svelte:head>

<section class="py-10 px-4 lg:px-8">
  <div class="mx-auto max-w-7xl space-y-5">
    <PageHeader title={m.nav_partner_admin()} description="{m.admin_records_total({ total: String(data.total) })}，{m.admin_records_page_info({ page: String(data.page), totalPages: String(totalPages) })}">
      <Button variant="default" size="sm" outline onclick={handleLogout}>
        <span class="icon-[tabler--logout] size-4"></span>
        {m.admin_logout()}
      </Button>
    </PageHeader>

    <Card shadow="sm">
      <form class="grid gap-3 md:grid-cols-[1fr_220px_auto]" onsubmit={handleFilter}>
        <Input placeholder={m.admin_search_placeholder()} bind:value={search} />
        <Select options={statusOptions} bind:value={status} />
        <Button type="submit" variant="primary">{m.admin_search_button()}</Button>
      </form>
    </Card>

    {#if data.loadError}
      <Alert variant="error">{data.loadError}</Alert>
    {/if}

    <Card shadow="sm" class="overflow-x-auto">
      <table class="table table-zebra w-full">
        <thead>
          <tr>
            <th class="text-base-content/70">{m.admin_col_time()}</th>
            <th class="text-base-content/70">{m.admin_col_company()}</th>
            <th class="text-base-content/70">{m.admin_col_contact()}</th>
            <th class="text-base-content/70">{m.admin_col_contact_info()}</th>
            <th class="text-base-content/70">{m.admin_col_type()}</th>
            <th class="text-base-content/70">{m.admin_col_budget()}</th>
            <th class="text-base-content/70">{m.admin_col_status()}</th>
          </tr>
        </thead>
        <tbody>
          {#if data.records.length === 0}
            <tr>
              <td colspan="7">
                <Empty description={m.admin_empty()} />
              </td>
            </tr>
          {:else}
            {#each data.records as item}
              <tr class="hover:bg-base-200/50 transition-colors">
                <td class="whitespace-nowrap tabular-nums">{String(item.created_at ?? '')}</td>
                <td class="font-medium">{String(item.company_name ?? '')}</td>
                <td>{String(item.contact_name ?? '')}</td>
                <td>
                  <div class="text-xs leading-5">
                    <div>{String(item.phone ?? '')}</div>
                    <div class="text-base-content/50">{String(item.email ?? '')}</div>
                  </div>
                </td>
                <td>{String(item.cooperation_type ?? '')}</td>
                <td>{String(item.budget_range ?? '')}</td>
                <td>
                  <Badge variant={statusVariantMap[String(item.status ?? '')] ?? 'default'} outline>
                    {String(item.status ?? '')}
                  </Badge>
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </Card>

    <div class="flex items-center justify-end gap-2">
      <Button size="sm" variant="default" disabled={data.page <= 1} onclick={() => navigatePage(data.page - 1)}>
        <span class="icon-[tabler--chevron-left] size-4"></span>
        {m.admin_page_prev()}
      </Button>
      <span class="text-sm text-base-content/60 tabular-nums">{data.page} / {totalPages}</span>
      <Button size="sm" variant="default" disabled={data.page >= totalPages} onclick={() => navigatePage(data.page + 1)}>
        {m.admin_page_next()}
        <span class="icon-[tabler--chevron-right] size-4"></span>
      </Button>
    </div>
  </div>
</section>
