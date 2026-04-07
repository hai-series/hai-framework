import type { PreviewComponent, PreviewSurface } from '../src/debugPreview'
import type { A2UiDebugMode } from '../src/debugTools'

import { createApp, h, ref } from 'vue'
import { buildPreviewSurface, resolveDynamicValue } from '../src/debugPreview'
import { A2UI_DEBUG_PRESETS, deriveA2UiDebugState, formatJson } from '../src/debugTools'

import './styles.css'

const jsonInput = document.querySelector<HTMLTextAreaElement>('#json-input')
const presetSelect = document.querySelector<HTMLSelectElement>('#preset-select')
const presetDescription = document.querySelector<HTMLParagraphElement>('#preset-description')
const modeValue = document.querySelector<HTMLParagraphElement>('#mode-value')
const pipelineValue = document.querySelector<HTMLParagraphElement>('#pipeline-value')
const summaryValue = document.querySelector<HTMLParagraphElement>('#summary-value')
const parsedInput = document.querySelector<HTMLPreElement>('#parsed-input')
const extractedMessages = document.querySelector<HTMLPreElement>('#extracted-messages')
const fallbackOutput = document.querySelector<HTMLPreElement>('#fallback-output')
const statusPill = document.querySelector<HTMLSpanElement>('#status-pill')
const messagesButton = document.querySelector<HTMLButtonElement>('#mode-messages')
const outputsButton = document.querySelector<HTMLButtonElement>('#mode-outputs')
const applyPresetButton = document.querySelector<HTMLButtonElement>('#apply-preset')
const formatButton = document.querySelector<HTMLButtonElement>('#format-json')
const rerenderButton = document.querySelector<HTMLButtonElement>('#rerender')
const renderPreview = document.querySelector<HTMLDivElement>('#render-preview')

if (
  !jsonInput
  || !presetSelect
  || !presetDescription
  || !modeValue
  || !pipelineValue
  || !summaryValue
  || !parsedInput
  || !extractedMessages
  || !fallbackOutput
  || !statusPill
  || !messagesButton
  || !outputsButton
  || !applyPresetButton
  || !formatButton
  || !rerenderButton
  || !renderPreview
) {
  throw new Error('A2UI debug page failed to boot because required DOM nodes are missing.')
}

const previewMessages = ref<unknown[]>([])
const previewFallback = ref('')

function asString(value: unknown): string {
  return String(value ?? '')
}

function getChildren(component: PreviewComponent, _surface: PreviewSurface): string[] {
  const child = typeof component.child === 'string' ? component.child : null
  if (child)
    return [child]

  const explicitList = (component.children as { explicitList?: unknown[] } | undefined)?.explicitList
  if (Array.isArray(explicitList))
    return explicitList.filter(item => typeof item === 'string') as string[]

  return []
}

function renderTable(component: PreviewComponent, surface: PreviewSurface) {
  const rawRows = resolveDynamicValue(component.rows ?? component.data ?? [], surface)
  const rows = Array.isArray(rawRows) ? rawRows as Array<Record<string, unknown>> : []
  const explicitColumns = resolveDynamicValue(component.columns ?? [], surface)
  const columns = Array.isArray(explicitColumns) && explicitColumns.length
    ? explicitColumns.map(item => String(item))
    : Object.keys(rows[0] ?? {})

  return h('div', { class: 'debug-table-wrap' }, [
    h('table', { class: 'debug-table' }, [
      h('thead', {}, [
        h('tr', {}, columns.map(column => h('th', { key: `h_${column}` }, column))),
      ]),
      h('tbody', {}, rows.length
        ? rows.map((row, index) => h('tr', { key: `r_${index}` }, columns.map(column => h('td', { key: `c_${index}_${column}` }, asString(row?.[column])))))
        : [h('tr', { key: 'empty' }, [h('td', { colspan: Math.max(columns.length, 1) }, '(no data)')])]),
    ]),
  ])
}

function renderBarChart(component: PreviewComponent, surface: PreviewSurface) {
  const rawData = resolveDynamicValue(component.data ?? [], surface)
  const rows = Array.isArray(rawData) ? rawData as Array<Record<string, unknown>> : []
  const categories = rows.map((row, index) => asString(row.label ?? row.name ?? row.x ?? `${index + 1}`))
  const first = rows[0] ?? {}
  const metricKeys = ('value' in first || 'y' in first)
    ? ['value']
    : Object.keys(first).filter(key => !['label', 'name', 'x'].includes(key))
  const colors = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']
  const series = metricKeys.map((key, index) => ({
    key,
    color: colors[index % colors.length],
    values: rows.map(row => Number((key === 'value' ? row.value ?? row.y : row[key]) ?? 0)),
  }))
  const max = Math.max(1, ...series.flatMap(item => item.values))

  return h('div', { class: 'debug-chart-block' }, [
    h('div', { class: 'debug-chart-legend' }, series.map(item =>
      h('span', { key: item.key, class: 'debug-legend-item' }, [
        h('i', { class: 'debug-legend-dot', style: { background: item.color } }),
        item.key,
      ]))),
    h('div', { class: 'debug-bar-chart' }, categories.map((label, categoryIndex) =>
      h('div', { key: label, class: 'debug-bar-group' }, [
        h('div', { class: 'debug-bar-stack' }, series.map((item) => {
          const value = item.values[categoryIndex] ?? 0
          const height = `${Math.max(8, (value / max) * 180)}px`
          return h('div', {
            key: `${item.key}_${label}`,
            class: 'debug-bar',
            title: `${item.key}: ${value}`,
            style: { height, background: item.color },
          })
        })),
        h('div', { class: 'debug-bar-label' }, label),
      ]))),
  ])
}

function renderLineChart(component: PreviewComponent, surface: PreviewSurface) {
  const rawData = resolveDynamicValue(component.data ?? [], surface)
  const rows = Array.isArray(rawData) ? rawData as Array<Record<string, unknown>> : []
  const categories = rows.map((row, index) => asString(row.label ?? row.name ?? row.x ?? `${index + 1}`))
  const first = rows[0] ?? {}
  const metricKeys = ('value' in first || 'y' in first)
    ? ['value']
    : Object.keys(first).filter(key => !['label', 'name', 'x'].includes(key))
  const colors = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']
  const series = metricKeys.map((key, index) => ({
    key,
    color: colors[index % colors.length],
    values: rows.map(row => Number((key === 'value' ? row.value ?? row.y : row[key]) ?? 0)),
  }))
  const width = 420
  const height = 220
  const pad = 24
  const max = Math.max(1, ...series.flatMap(item => item.values))

  const polylines = series.map((item) => {
    const points = item.values.map((value, index) => {
      const x = categories.length === 1 ? width / 2 : pad + (index * (width - pad * 2)) / Math.max(categories.length - 1, 1)
      const y = height - pad - (value / max) * (height - pad * 2)
      return `${x},${y}`
    })
    return { ...item, points: points.join(' ') }
  })

  return h('div', { class: 'debug-chart-block' }, [
    h('div', { class: 'debug-chart-legend' }, polylines.map(item =>
      h('span', { key: item.key, class: 'debug-legend-item' }, [
        h('i', { class: 'debug-legend-dot', style: { background: item.color } }),
        item.key,
      ]))),
    h('svg', { class: 'debug-line-chart', viewBox: `0 0 ${width} ${height}` }, [
      ...polylines.map(item => h('polyline', {
        'key': item.key,
        'points': item.points,
        'fill': 'none',
        'stroke': item.color,
        'stroke-width': 3,
      })),
      ...polylines.flatMap(item => item.values.map((value, index) => {
        const x = categories.length === 1 ? width / 2 : pad + (index * (width - pad * 2)) / Math.max(categories.length - 1, 1)
        const y = height - pad - (value / max) * (height - pad * 2)
        return h('circle', {
          key: `${item.key}_${index}`,
          cx: x,
          cy: y,
          r: 4,
          fill: item.color,
        })
      })),
    ]),
    h('div', { class: 'debug-line-labels' }, categories.map(label => h('span', { key: label }, label))),
  ])
}

function renderPieChart(component: PreviewComponent, surface: PreviewSurface) {
  const rawData = resolveDynamicValue(component.data ?? [], surface)
  const rows = Array.isArray(rawData) ? rawData as Array<Record<string, unknown>> : []
  const colors = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316']
  const total = Math.max(1, rows.reduce((sum, row) => sum + Number(row.value ?? row.y ?? 0), 0))
  const segments = rows.map((row, index) => ({
    label: asString(row.label ?? row.name ?? `${index + 1}`),
    value: Number(row.value ?? row.y ?? 0),
    color: colors[index % colors.length],
    percent: `${((Number(row.value ?? row.y ?? 0) / total) * 100).toFixed(1)}%`,
  }))
  const gradient = segments.length
    ? `conic-gradient(${segments.map((segment, index) => {
      const start = segments.slice(0, index).reduce((sum, item) => sum + item.value, 0)
      const end = start + segment.value
      return `${segment.color} ${(start / total) * 100}% ${(end / total) * 100}%`
    }).join(', ')})`
    : '#e5e7eb'

  return h('div', { class: 'debug-pie-wrap' }, [
    h('div', { class: 'debug-pie-chart', style: { background: gradient } }),
    h('div', { class: 'debug-pie-legend' }, segments.map(segment =>
      h('div', { key: segment.label, class: 'debug-pie-item' }, [
        h('i', { class: 'debug-legend-dot', style: { background: segment.color } }),
        h('span', { class: 'debug-pie-name' }, segment.label),
        h('span', { class: 'debug-pie-value' }, `${segment.value} (${segment.percent})`),
      ]))),
  ])
}

function renderPreviewNode(componentId: string, surface: PreviewSurface): ReturnType<typeof h> {
  const component = surface.components.get(componentId)
  if (!component)
    return h('div', { class: 'debug-unknown' }, `Missing component: ${componentId}`)

  switch (component.component) {
    case 'Card':
      return h('section', { class: 'debug-card' }, getChildren(component, surface).map(childId => renderPreviewNode(childId, surface)))
    case 'Column':
      return h('div', { class: 'debug-column' }, getChildren(component, surface).map(childId => renderPreviewNode(childId, surface)))
    case 'Row':
      return h('div', { class: 'debug-row' }, getChildren(component, surface).map(childId => renderPreviewNode(childId, surface)))
    case 'List':
      return h('div', { class: 'debug-column' }, getChildren(component, surface).map(childId => renderPreviewNode(childId, surface)))
    case 'Text': {
      const variant = asString(component.variant ?? component.usageHint ?? 'body')
      const text = asString(resolveDynamicValue(component.text ?? '', surface))
      return h(variant === 'h4' ? 'h3' : variant === 'h1' ? 'h1' : variant === 'h2' ? 'h2' : 'p', { class: `debug-text debug-text-${variant}` }, text)
    }
    case 'Table':
      return renderTable(component, surface)
    case 'BarChart':
      return renderBarChart(component, surface)
    case 'LineChart':
      return renderLineChart(component, surface)
    case 'PieChart':
      return renderPieChart(component, surface)
    default:
      return h('div', { class: 'debug-unknown' }, `Unknown component: ${component.component}`)
  }
}

createApp({
  setup() {
    return () => {
      const previewSurface = buildPreviewSurface(previewMessages.value)

      if (previewSurface && previewSurface.components.has(previewSurface.rootId))
        return renderPreviewNode(previewSurface.rootId, previewSurface)

      return h('div', { class: 'preview-empty' }, [
        h('h3', '当前没有可渲染的 A2UI 消息'),
        h('p', previewFallback.value || '请在左侧输入合法的消息数组或 outputs 对象。'),
      ])
    }
  },
}).mount(renderPreview)

let currentMode: A2UiDebugMode = 'messages'

for (const preset of A2UI_DEBUG_PRESETS) {
  const option = document.createElement('option')
  option.value = preset.id
  option.textContent = preset.label
  presetSelect.append(option)
}

function setMode(mode: A2UiDebugMode) {
  currentMode = mode
  if (messagesButton)
    messagesButton.dataset.active = String(mode === 'messages')
  if (outputsButton)
    outputsButton.dataset.active = String(mode === 'outputs')

  const matchedPreset = A2UI_DEBUG_PRESETS.find((preset: { mode: string }) => preset.mode === mode)
  if (matchedPreset && presetSelect)
    presetSelect.value = matchedPreset.id

  updatePresetDescription()
}

function updatePresetDescription() {
  const preset = A2UI_DEBUG_PRESETS.find((item: { id: string }) => item.id === presetSelect?.value)
  if (presetDescription)
    presetDescription.textContent = preset?.description ?? '选择一个预置样例，或直接粘贴自己的 JSON。'
}

function applyPreset() {
  const preset = A2UI_DEBUG_PRESETS.find((item: { id: string }) => item.id === presetSelect?.value)
  if (!preset)
    return

  setMode(preset.mode)
  if (jsonInput)
    jsonInput.value = preset.input
  updatePresetDescription()
  refresh()
}

function toPretty(value: unknown): string {
  if (value === null || value === undefined)
    return ''
  return JSON.stringify(value, null, 2)
}

function refresh() {
  const state = deriveA2UiDebugState(currentMode, jsonInput?.value ?? '')
  if (modeValue)
    modeValue.textContent = currentMode
  if (pipelineValue)
    pipelineValue.textContent = state.pipeline
  if (summaryValue)
    summaryValue.textContent = state.summary
  if (parsedInput)
    parsedInput.textContent = toPretty(state.parsedInput)
  if (extractedMessages)
    extractedMessages.textContent = toPretty(state.extractedMessages)
  if (fallbackOutput)
    fallbackOutput.textContent = state.error ?? state.fallbackText ?? ''
  previewMessages.value = state.renderedMessages
  previewFallback.value = state.error ?? state.fallbackText

  if (statusPill) {
    statusPill.textContent = state.error
      ? '存在问题'
      : state.renderedMessages.length > 0
        ? '可渲染'
        : state.fallbackText
          ? '文本回退'
          : '空结果'
    statusPill.dataset.state = state.error
      ? 'error'
      : state.renderedMessages.length > 0
        ? 'ready'
        : 'fallback'
  }
}

messagesButton?.addEventListener('click', () => {
  setMode('messages')
  refresh()
})

outputsButton?.addEventListener('click', () => {
  setMode('outputs')
  refresh()
})

presetSelect?.addEventListener('change', updatePresetDescription)
applyPresetButton?.addEventListener('click', applyPreset)
rerenderButton?.addEventListener('click', refresh)

formatButton?.addEventListener('click', () => {
  if (jsonInput)
    jsonInput.value = formatJson(jsonInput.value)
  refresh()
})

jsonInput?.addEventListener('input', refresh)

setMode('messages')
applyPreset()
