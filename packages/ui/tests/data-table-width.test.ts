import { render } from 'svelte/server'
import { describe, expect, it } from 'vitest'
import DataTable from '../src/lib/components/compounds/DataTable.svelte'
import Drawer from '../src/lib/components/compounds/Drawer.svelte'

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

  it('配置列点击回调时应渲染可访问的单元格按钮', () => {
    const { body } = render(DataTable, {
      props: {
        data: [{ id: 'asset_1', title: '安全公告' }],
        columns: [{ key: 'title', label: '标题', onclick: () => undefined }],
        keyField: 'id',
      },
    })

    expect(body).toContain('<button type="button"')
    expect(body).toContain('title="安全公告"')
  })

  it('可调整宽度的横向抽屉应渲染拖动手柄', () => {
    const { body } = render(Drawer, {
      props: {
        open: true,
        position: 'right',
        resizable: true,
        widthStorageKey: 'drawer-test-width',
      },
    })

    expect(body).toContain('data-drawer-resize-handle')
    expect(body).toContain('aria-label="调整抽屉宽度"')
  })
})
