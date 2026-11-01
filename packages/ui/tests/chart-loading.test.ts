// @vitest-environment jsdom
import { flushSync, mount, unmount } from 'svelte'
import { expect, it, vi } from 'vitest'
import ChartLoadingHarness from './fixtures/ChartLoadingHarness.svelte'

const imports = vi.hoisted(() => {
  let releaseBar = () => {}
  const barGate = new Promise<void>((resolve) => {
    releaseBar = resolve
  })
  return { bar: vi.fn(), line: vi.fn(), barLoaded: vi.fn(), barGate, releaseBar }
})
vi.mock('../src/lib/components/scenes/charts/renderers/BarChart.svelte', async () => {
  imports.bar()
  await imports.barGate
  const renderer = await import('./fixtures/ChartBarRendererMock.svelte')
  imports.barLoaded()
  return renderer
})
vi.mock('../src/lib/components/scenes/charts/renderers/LineChart.svelte', async () => {
  imports.line()
  return import('./fixtures/ChartRendererMock.svelte')
})

it('加载与空态不导入渲染器，快速切换丢弃旧加载结果，原生参数覆盖预设', async () => {
  const target = document.createElement('div')
  const component = mount(ChartLoadingHarness, { target })
  const click = (label: string) => {
    ;[...target.querySelectorAll('button')].find(button => button.textContent === label)!.click()
    flushSync()
  }
  try {
    flushSync()
    expect(imports.bar).not.toHaveBeenCalled()
    click('Empty')
    expect(imports.bar).not.toHaveBeenCalled()
    click('Ready')
    await vi.waitFor(() => expect(imports.bar).toHaveBeenCalledOnce())
    expect(target.querySelector('[data-renderer-props]')).toBeNull()
    click('Line')
    await vi.waitFor(() => expect(target.querySelector('[data-renderer-props]')).not.toBeNull())
    expect(imports.line).toHaveBeenCalledOnce()
    const rendered = target.querySelector('[data-renderer-props]')!.textContent!
    expect(JSON.parse(rendered)).toMatchObject({ seriesLayout: 'group', height: 180, legend: false, customOption: 'native', x: 'month', y: 'revenue' })
    imports.releaseBar()
    await vi.waitFor(() => expect(imports.barLoaded).toHaveBeenCalledOnce())
    flushSync()
    expect(target.querySelector('[data-bar-renderer]')).toBeNull()
    expect(target.querySelectorAll('[data-renderer-props]')).toHaveLength(1)
    expect(target.querySelector('[data-renderer-props]')!.textContent).toBe(rendered)
  }
  finally {
    imports.releaseBar()
    await unmount(component)
  }
})
