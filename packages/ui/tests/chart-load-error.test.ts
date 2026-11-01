// @vitest-environment jsdom
import { flushSync, mount, unmount } from 'svelte'
import { expect, it, vi } from 'vitest'
import Chart from '../src/lib/components/scenes/charts/Chart.svelte'
import { toast } from '../src/lib/toast.svelte.js'

vi.mock('../src/lib/components/scenes/charts/renderers/LineChart.svelte', () => {
  throw new Error('Simulated chunk failure with private implementation details')
})

it('分块加载失败保留恢复操作，统一提示不暴露底层异常', async () => {
  const target = document.createElement('div')
  const component = mount(Chart, { target, props: { type: 'line', data: [{ x: 'A', y: 1 }], x: 'x', y: 'y' } })
  try {
    flushSync()
    await vi.waitFor(() => expect(target.querySelector('button')).not.toBeNull())
    expect(target.textContent).not.toContain('private implementation details')
    expect(toast.items.some(item => item.message.includes('图表加载失败'))).toBe(true)
    expect(toast.items.every(item => !item.message.includes('private implementation details'))).toBe(true)
  }
  finally {
    await unmount(component)
    toast.clear()
  }
})
