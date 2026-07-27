import { render } from 'svelte/server'
import { describe, expect, it } from 'vitest'
import DataTable from '../src/lib/components/compounds/DataTable.svelte'

describe('data table 列宽', () => {
  it('显式 4rem 宽度不应被默认最小列宽覆盖', () => {
    const { body } = render(DataTable, {
      props: {
        data: [{ id: 'asset_1', name: 'this-is-a-very-long-asset-file-name.png' }],
        columns: [{ key: 'name', label: '名称', width: '4rem' }],
        keyField: 'id',
      },
    })

    const columnStyle = 'width: min(4rem, 20vw); min-width: 0; max-width: min(4rem, 20vw);'
    expect(body.split(columnStyle)).toHaveLength(3)
    expect(body).toContain('class="block min-w-0 truncate" style="max-width: min(4rem, 20vw);" title="this-is-a-very-long-asset-file-name.png"')
  })
})
