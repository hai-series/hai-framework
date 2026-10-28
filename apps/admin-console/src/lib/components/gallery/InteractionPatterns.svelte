<script lang='ts'>
  import * as m from '$lib/paraglide/messages'
  import { DataTable, Empty, Pagination, TableToolbar, Tabs } from '@h-ai/ui/components/compounds/index'
  import { Button } from '@h-ai/ui/components/primitives/index'
  import { useToastFeedback } from '@h-ai/ui/toast'

  let viewState = $state('ready')
  let page = $state(1)
  let search = $state('')
  let searchDraft = $state('')
  let filters = $state<Record<string, unknown>>({})
  let filterDraft = $state<Record<string, unknown>>({})
  let sortBy = $state('name')
  let sortDirection = $state<'asc' | 'desc'>('asc')
  let viewMode = $state<'table' | 'card'>('table')
  let selected = $state('')
  const records = Array.from({ length: 80 }, (_, index) => ({ id: String(index), name: `${index % 2 ? 'Beta / Regional delivery coordination' : 'Alpha / International operations and customer support'} ${index + 1}`, active: index % 3 !== 0 }))
  const filtered = $derived(viewState === 'empty'
    ? []
    : records
      .filter(row => row.name.toLowerCase().includes(search.toLowerCase()) && (!filters.active || String(row.active) === filters.active))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }) * (sortDirection === 'asc' ? 1 : -1)))
  const visible = $derived(filtered.slice((page - 1) * 10, page * 10))

  function searchRecords(value: string) {
    search = value
    filters = { ...filterDraft }
    page = 1
  }

  function sortRecords(key: string, direction: 'asc' | 'desc') {
    sortBy = key
    sortDirection = direction
  }

  function resetRecords() {
    search = ''
    searchDraft = ''
    filters = {}
    filterDraft = {}
    page = 1
    viewState = 'ready'
  }
  useToastFeedback(() => viewState === 'error' ? `${m.gallery_interaction_error_title()} ${m.gallery_interaction_error_description()}` : '')
</script>

<section data-testid='interaction-patterns' class='min-w-0 space-y-5 rounded-xl border border-base-300 bg-base-100 p-4 sm:p-6'>
  <header class='space-y-2'>
    <h2 class='text-lg font-semibold'>{m.gallery_interaction_title()}</h2>
    <p class='max-w-prose text-sm text-base-content/70 leading-relaxed'>{m.gallery_interaction_description()}</p>
  </header>
  <Tabs bind:active={viewState} onchange={() => page = 1} items={[
    { key: 'disabled', label: m.gallery_interaction_unavailable(), disabled: true },
    { key: 'ready', label: m.gallery_interaction_ready() },
    { key: 'loading', label: m.gallery_interaction_loading() },
    { key: 'empty', label: m.gallery_interaction_empty() },
    { key: 'error', label: m.gallery_interaction_error() },
  ]}>
    <div class='min-w-0 space-y-4'>
      <TableToolbar bind:searchValue={searchDraft} bind:filterValues={filterDraft} bind:viewMode searchLabel={m.gallery_interaction_search()} searchPlaceholder={m.gallery_interaction_search()} filterFields={[{ id: 'active', label: m.gallery_interaction_status(), type: 'boolean' }]} showViewSwitch onsearch={searchRecords} onclearfilters={resetRecords} />
      {#if viewState === 'error'}
        <Empty title={m.gallery_interaction_error_title()}>
          {#snippet action()}<Button size='sm' onclick={() => viewState = 'ready'}>{m.gallery_interaction_retry()}</Button>{/snippet}
        </Empty>
      {:else}
        {#if viewMode === 'table' || viewState !== 'ready' || !visible.length}
          <DataTable keyField='id' columns={[{ key: 'name', label: m.gallery_interaction_name(), sortable: true }]} data={visible} loading={viewState === 'loading'} sortKey={sortBy} sortDir={sortDirection} onsort={sortRecords} onrowclick={row => selected = row.name}>
            {#snippet empty()}
              <Empty icon='search' title={m.gallery_interaction_empty_title()} description={m.gallery_interaction_empty_description()}>
                {#snippet action()}<Button size='sm' onclick={resetRecords}>{m.gallery_interaction_reset()}</Button>{/snippet}
              </Empty>
            {/snippet}
          </DataTable>
        {:else}
          <div class='grid min-w-0 gap-3 sm:grid-cols-2'>
            {#each visible as record (record.id)}
              <button type='button' class='min-w-0 rounded-lg border border-base-300 p-4 text-left text-sm [overflow-wrap:anywhere] hover:border-primary' onclick={() => selected = record.name}>{record.name}</button>
            {/each}
          </div>
        {/if}
        <Pagination bind:page total={filtered.length} pageSize={10} showJumper />
      {/if}
      {#if selected}<p role='status' class='text-sm text-base-content/70 [overflow-wrap:anywhere]'>{selected}</p>{/if}
    </div>
  </Tabs>
</section>
