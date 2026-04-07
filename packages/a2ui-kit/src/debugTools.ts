import { buildAssistantDisplayFromOutputs, extractA2UiPayload, isA2UiEnvelope, parseA2UiMessageLines } from './parseWorkflowOutputs'

export type A2UiDebugMode = 'messages' | 'outputs'

export interface A2UiDebugPreset {
  id: string
  label: string
  description: string
  mode: A2UiDebugMode
  input: string
}

export interface A2UiDebugState {
  mode: A2UiDebugMode
  isJsonValid: boolean
  summary: string
  pipeline: string
  parsedInput: unknown | null
  extractedMessages: unknown[]
  renderedMessages: unknown[]
  fallbackText: string
  error: string | null
}

type A2UiMessage = Record<string, unknown>

function makeSurfaceMessages(surfaceId: string, title: string, bodyComponents: A2UiMessage[]): A2UiMessage[] {
  return [
    {
      version: 'v0.10',
      createSurface: {
        surfaceId,
        catalogId: '',
      },
    },
    {
      version: 'v0.10',
      updateComponents: {
        surfaceId,
        components: [
          {
            id: 'root',
            component: 'Card',
            child: 'main_col',
          },
          {
            id: 'main_col',
            component: 'Column',
            children: {
              explicitList: ['title', ...bodyComponents.map(component => String(component.id))],
            },
          },
          {
            id: 'title',
            component: 'Text',
            variant: 'h4',
            text: title,
          },
          ...bodyComponents,
        ],
      },
    },
    {
      version: 'v0.10',
      beginRendering: {
        surfaceId,
        root: 'root',
      },
    },
  ]
}

const SALES_MESSAGES = makeSurfaceMessages('sales-overview', '销售概览', [
  {
    id: 'summary',
    component: 'Text',
    variant: 'body',
    text: '本周销售额较上周增长 12%，可直接用来验证基础渲染链路。',
  },
])

const TABLE_MESSAGES = makeSurfaceMessages('city-ranking', '城市销售排行', [
  {
    id: 'tbl',
    component: 'Table',
    columns: ['city', 'gmv', 'orders'],
    rows: [
      { city: '上海', gmv: 46200, orders: 412 },
      { city: '深圳', gmv: 38100, orders: 366 },
      { city: '杭州', gmv: 31500, orders: 294 },
    ],
  },
])

const BAR_MESSAGES = makeSurfaceMessages('sales-trend-bar', '季度案件分布', [
  {
    id: 'bar',
    component: 'BarChart',
    data: [
      { label: 'Q1', 待签收: 42, 审理中: 18, 已结案: 12 },
      { label: 'Q2', 待签收: 58, 审理中: 22, 已结案: 16 },
      { label: 'Q3', 待签收: 49, 审理中: 20, 已结案: 14 },
    ],
  },
])

const LINE_MESSAGES = makeSurfaceMessages('sales-trend-line', '月度趋势', [
  {
    id: 'line',
    component: 'LineChart',
    data: [
      { label: '1月', 新增: 10, 活跃: 26, 结案: 8 },
      { label: '2月', 新增: 18, 活跃: 22, 结案: 11 },
      { label: '3月', 新增: 22, 活跃: 30, 结案: 16 },
      { label: '4月', 新增: 16, 活跃: 28, 结案: 18 },
    ],
  },
])

const PIE_MESSAGES = makeSurfaceMessages('sales-share-pie', '来源占比', [
  {
    id: 'pie',
    component: 'PieChart',
    data: [
      { label: '搜索', value: 42 },
      { label: '推荐', value: 26 },
      { label: '广告', value: 18 },
      { label: '其他', value: 14 },
    ],
  },
])

export const A2UI_DEBUG_PRESETS: A2UiDebugPreset[] = [
  {
    id: 'messages-card',
    label: '纯消息 / 卡片',
    description: '直接验证 A2UI messages 是否能被正常渲染。',
    mode: 'messages',
    input: JSON.stringify(SALES_MESSAGES, null, 2),
  },
  {
    id: 'messages-table',
    label: '纯消息 / 表格',
    description: '验证 patch 后的 Table 组件是否正常展示。',
    mode: 'messages',
    input: JSON.stringify(TABLE_MESSAGES, null, 2),
  },
  {
    id: 'messages-bar',
    label: '纯消息 / 柱状图',
    description: '验证 BarChart 图表预览。',
    mode: 'messages',
    input: JSON.stringify(BAR_MESSAGES, null, 2),
  },
  {
    id: 'messages-line',
    label: '纯消息 / 折线图',
    description: '验证 LineChart 图表预览。',
    mode: 'messages',
    input: JSON.stringify(LINE_MESSAGES, null, 2),
  },
  {
    id: 'messages-pie',
    label: '纯消息 / 饼图',
    description: '验证 PieChart 图表预览。',
    mode: 'messages',
    input: JSON.stringify(PIE_MESSAGES, null, 2),
  },
  {
    id: 'outputs-double-encoded',
    label: 'Outputs / 双编码',
    description: '验证 systemResponse 双编码字符串能否被正确提取。',
    mode: 'outputs',
    input: JSON.stringify({
      systemResponse: JSON.stringify(TABLE_MESSAGES),
    }, null, 2),
  },
  {
    id: 'outputs-fallback',
    label: 'Outputs / 纯文本回退',
    description: '验证没有 A2UI 时会回落到 chat_content。',
    mode: 'outputs',
    input: JSON.stringify({
      systemResponse: '本次没有结构化 A2UI，只有普通文本结果。',
    }, null, 2),
  },
]

function tryParseJson(raw: string): { ok: true, value: unknown } | { ok: false, error: string } {
  try {
    return { ok: true, value: JSON.parse(raw) }
  }
  catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'JSON parse failed',
    }
  }
}

function summarizeMessages(messages: unknown[]): string {
  if (!messages.length)
    return '未得到可渲染的 A2UI 消息'
  return `得到 ${messages.length} 条 A2UI 消息，可直接送入渲染器`
}

function canRenderMessages(messages: unknown[]): boolean {
  if (!messages.length)
    return false

  const surfaceIds = new Set<string>()
  const roots = new Set<string>()

  for (const message of messages) {
    const msg = message as Record<string, unknown>
    if (typeof msg.createSurface?.surfaceId === 'string')
      surfaceIds.add(msg.createSurface.surfaceId)
    if (typeof msg.updateComponents?.surfaceId === 'string')
      surfaceIds.add(msg.updateComponents.surfaceId)
    if (typeof msg.beginRendering?.surfaceId === 'string')
      surfaceIds.add(msg.beginRendering.surfaceId)
    if (typeof msg.beginRendering?.root === 'string')
      roots.add(msg.beginRendering.root)
  }

  return surfaceIds.size > 0 && roots.size > 0
}

function parseMessagesMode(raw: string): A2UiDebugState {
  const parsed = tryParseJson(raw)
  if (!parsed.ok) {
    return {
      mode: 'messages',
      isJsonValid: false,
      summary: '输入不是合法 JSON',
      pipeline: 'messages -> JSON.parse',
      parsedInput: null,
      extractedMessages: [],
      renderedMessages: [],
      fallbackText: '',
      error: parsed.error,
    }
  }

  if (!Array.isArray(parsed.value) || !parsed.value.every(isA2UiEnvelope)) {
    return {
      mode: 'messages',
      isJsonValid: true,
      summary: 'JSON 合法，但不是 A2UI 消息数组',
      pipeline: 'messages -> envelope validation',
      parsedInput: parsed.value,
      extractedMessages: [],
      renderedMessages: [],
      fallbackText: '',
      error: '当前模式要求顶层是合法的 A2UI 消息数组。',
    }
  }

  const renderedMessages = parseA2UiMessageLines(JSON.stringify(parsed.value))
  const canRender = canRenderMessages(renderedMessages)
  return {
    mode: 'messages',
    isJsonValid: true,
    summary: canRender
      ? summarizeMessages(renderedMessages)
      : '消息数组合法，但缺少可渲染的 surface 信息',
    pipeline: 'messages -> JSON.parse -> envelope validation -> renderability check -> renderer',
    parsedInput: parsed.value,
    extractedMessages: renderedMessages,
    renderedMessages,
    fallbackText: '',
    error: !renderedMessages.length
      ? '消息数组存在，但未通过渲染前校验。'
      : !canRender
          ? '消息缺少 createSurface/updateComponents/beginRendering 所需的 surfaceId 或 root，渲染器无法挂载。'
          : null,
  }
}

function parseOutputsMode(raw: string): A2UiDebugState {
  const parsed = tryParseJson(raw)
  if (!parsed.ok) {
    return {
      mode: 'outputs',
      isJsonValid: false,
      summary: '输入不是合法 JSON',
      pipeline: 'outputs -> JSON.parse',
      parsedInput: null,
      extractedMessages: [],
      renderedMessages: [],
      fallbackText: '',
      error: parsed.error,
    }
  }

  if (!parsed.value || typeof parsed.value !== 'object' || Array.isArray(parsed.value)) {
    return {
      mode: 'outputs',
      isJsonValid: true,
      summary: 'JSON 合法，但 outputs 必须是对象',
      pipeline: 'outputs -> object validation',
      parsedInput: parsed.value,
      extractedMessages: [],
      renderedMessages: [],
      fallbackText: '',
      error: '当前模式要求输入形如 { systemResponse, systemOutput, a2ui ... } 的对象。',
    }
  }

  const outputs = parsed.value as Record<string, unknown>
  const payload = extractA2UiPayload(outputs)
  const extractedMessages = payload ? (JSON.parse(payload) as unknown[]) : []
  const display = buildAssistantDisplayFromOutputs(outputs)
  const renderedMessages = Array.isArray(display.a2ui_messages) ? display.a2ui_messages : []
  const fallbackText = display.chat_content ?? ''

  return {
    mode: 'outputs',
    isJsonValid: true,
    summary: renderedMessages.length
      ? summarizeMessages(renderedMessages)
      : fallbackText
        ? '未解析出 A2UI，当前将走文本回退'
        : '未解析出 A2UI，也没有可用回退文本',
    pipeline: 'outputs -> extractA2UiPayload -> buildAssistantDisplayFromOutputs -> renderer/fallback',
    parsedInput: parsed.value,
    extractedMessages,
    renderedMessages,
    fallbackText,
    error: renderedMessages.length || fallbackText
      ? null
      : '输入已解析，但没有得到 A2UI 消息，也没有回退文本。',
  }
}

export function deriveA2UiDebugState(mode: A2UiDebugMode, raw: string): A2UiDebugState {
  if (mode === 'messages')
    return parseMessagesMode(raw)
  return parseOutputsMode(raw)
}

export function formatJson(raw: string): string {
  const parsed = tryParseJson(raw)
  if (!parsed.ok)
    return raw
  return JSON.stringify(parsed.value, null, 2)
}
