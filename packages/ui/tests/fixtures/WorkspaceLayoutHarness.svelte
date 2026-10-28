<script lang='ts'>
  import { PageHeader } from '../../src/lib/components/compounds/index.js'
  import { SettingsLayout, WorkspaceLayout } from '../../src/lib/components/scenes/app/index.js'
  import { CrudPage, defineCrud } from '../../src/lib/components/scenes/crud/index.js'

  const { mode = 'header' }: { mode?: 'header' | 'crud' | 'settings' } = $props()
  let title = $state('Records')
  const crud = defineCrud({ name: 'records', label: 'Records', fields: [{ id: 'name', label: 'Name', type: 'text', inList: true }], searchable: false, api: { list: async () => ({ items: [], total: 0, page: 1, pageSize: 20 }), create: async () => ({ id: 'new', name: 'Created' }) } })
</script>

<button type='button' onclick={() => { title = title === 'Records' ? 'Other' : 'Records' }}>Switch navigation</button>
<WorkspaceLayout {title}>
  {#if mode === 'header'}
    <PageHeader title='Records' description='Record details'>
      {#snippet actions()}<button type='button'>Export</button>{/snippet}
    </PageHeader>
  {:else if mode === 'settings'}
    <SettingsLayout title='Records' description='Record details'><button type='button'>Export</button></SettingsLayout>
  {:else}
    <CrudPage {crud} data={{ items: [], total: 0, page: 1, pageSize: 20 }}>
      {#snippet headerActions()}<button type='button'>Import</button>{/snippet}
    </CrudPage>
  {/if}
  {#snippet footer()}Build v1{/snippet}
</WorkspaceLayout>
