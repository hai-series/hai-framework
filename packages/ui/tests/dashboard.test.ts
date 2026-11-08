// @vitest-environment jsdom
import { createRawSnippet, flushSync, mount, unmount } from 'svelte'
import { afterEach, expect, it } from 'vitest'
import MetricCard from '../src/lib/components/scenes/charts/MetricCard.svelte'
import ReportCard from '../src/lib/components/scenes/charts/ReportCard.svelte'
import { setUILocale } from '../src/lib/messages.js'

afterEach(() => setUILocale('zh-CN'))

it('指标卡显示零值、带方向的变化和业务比较说明，加载时隐藏旧值', async () => {
  const target = document.createElement('div')
  const component = mount(MetricCard, {
    target,
    props: {
      title: 'Revenue',
      value: 0,
      trend: -8.2,
      trendLabel: 'vs previous month',
      trendTone: 'success',
    },
  })
  try {
    flushSync()
    expect(target.textContent).toContain('0')
    expect(target.textContent).toContain('-8.2%')
    expect(target.textContent).toContain('vs previous month')
    expect(target.querySelector('[data-trend-direction]')?.getAttribute('data-trend-direction')).toBe('down')
  }
  finally { await unmount(component) }
  const loading = mount(MetricCard, {
    target,
    props: { title: 'Revenue', value: 999, loading: true },
  })
  try {
    flushSync()
    expect(target.textContent).not.toContain('999')
    expect(target.querySelector('[aria-busy="true"]')).not.toBeNull()
  }
  finally { await unmount(loading) }
})

it('指标卡不将缺失值或非有限数显示为零，变化方向不决定好坏', async () => {
  const target = document.createElement('div')
  for (const value of [null, Number.NaN, Number.POSITIVE_INFINITY]) {
    const component = mount(MetricCard, {
      target,
      props: { title: 'Revenue', value, trend: Number.NaN },
    })
    try {
      flushSync()
      expect(target.textContent).toContain('—')
      expect(target.querySelector('[data-trend-direction]')).toBeNull()
    }
    finally { await unmount(component) }
  }
})

it('报表内容插槽可承载任意原生图形，空态和加载态不渲染内容', async () => {
  const target = document.createElement('div')
  const children = createRawSnippet(() => ({
    render: () => '<div data-native-chart>Native visualization</div>',
  }))
  for (const state of [
    {},
    { loading: true },
    { empty: true },
  ]) {
    const component = mount(ReportCard, {
      target,
      props: { title: 'Report', children, ...state },
    })
    try {
      flushSync()
      expect(target.querySelector('[data-native-chart]') !== null).toBe(!('loading' in state || 'empty' in state))
      expect(target.querySelector('h2')?.textContent).toBe('Report')
    }
    finally { await unmount(component) }
  }
})

it('指标卡的变化辅助信息随语言更新', async () => {
  const target = document.createElement('div')
  const component = mount(MetricCard, {
    target,
    props: { title: 'Revenue', value: 10, trend: 4 },
  })
  try {
    flushSync()
    expect(target.textContent).toContain('上升')
    setUILocale('en-US')
    flushSync()
    expect(target.textContent).toContain('Increase')
    setUILocale('ja-JP')
    flushSync()
    expect(target.textContent).toContain('増加')
  }
  finally { await unmount(component) }
})
