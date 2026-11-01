import { expect, it } from 'vitest'
import { resolveChartPreset } from '../src/lib/components/scenes/charts/chart-presets.js'

it('常用预设映射到真实 LayerChart 配置，不改变调用方数据', () => {
  expect(resolveChartPreset('grouped-bar')).toMatchObject({ type: 'bar', props: { seriesLayout: 'group' } })
  expect(resolveChartPreset('stacked-bar')).toMatchObject({ type: 'bar', props: { seriesLayout: 'stack' } })
  expect(resolveChartPreset('stacked-area')).toMatchObject({ type: 'area', props: { seriesLayout: 'stack' } })
  expect(resolveChartPreset('donut')).toMatchObject({ type: 'pie', props: { innerRadius: 0.65 } })
  expect(resolveChartPreset('sparkline')).toMatchObject({ type: 'line', props: { axis: false, grid: false, legend: false, height: 64 } })
  expect(resolveChartPreset()).toEqual({ props: {} })
})
