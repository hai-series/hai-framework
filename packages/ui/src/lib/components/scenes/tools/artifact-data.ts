import type { AiTableData } from '../ai/table/table-types.js'
import type { ChartProps } from '../charts/chart-types.js'
import type { ArtifactCreateRequest } from './workspace-types.js'
import { escapeHtml } from '../ai/safe-html.js'
import { asRecord } from './tool-form.js'

/**
 * 读取可展示的表格结构，不将未知 JSON 直接断言为组件参数。
 * @example 模块内部上下文
 * ```ts
 * const data = readArtifactTable('{"table_columns":[],"table_rows":[]}')
 * ```
 */
export function readArtifactTable(content: string): AiTableData | undefined {
  try {
    const data = asRecord(JSON.parse(content))
    if (!data || !Array.isArray(data.table_columns) || !Array.isArray(data.table_rows))
      return undefined
    const columns: AiTableData['table_columns'] = []
    const rows: AiTableData['table_rows'] = []
    for (const value of data.table_columns) {
      const column = asRecord(value)
      if (!column || typeof column.key !== 'string' || !column.key.trim() || typeof column.label !== 'string'
        || (column.type !== 'text' && column.type !== 'number' && column.type !== 'tag')) {
        return undefined
      }
      columns.push({ key: column.key, label: column.label, type: column.type })
    }
    for (const value of data.table_rows) {
      const row = asRecord(value)
      if (!row || typeof row.row_id !== 'string' || !row.row_id.trim())
        return undefined
      rows.push({ ...row, row_id: row.row_id })
    }
    if (new Set(columns.map(column => column.key)).size !== columns.length || new Set(rows.map(row => row.row_id)).size !== rows.length)
      return undefined
    return { table_columns: columns, table_rows: rows }
  }
  catch { return undefined }
}

/**
 * 图表产物只接受数据及基本映射，不能注入组件回调或任意属性。
 * @example 模块内部上下文
 * ```ts
 * const chart = readArtifactChart('{"type":"bar","data":[{"x":"A","y":2}],"x":"x","y":"y"}')
 * ```
 */
export function readArtifactChart(content: string): ChartProps | undefined {
  try {
    const data = asRecord(JSON.parse(content))
    if (!data || !Array.isArray(data.data) || typeof data.x !== 'string'
      || !(typeof data.y === 'string' || (Array.isArray(data.y) && data.y.every(item => typeof item === 'string')))
      || data.data.some(row => !asRecord(row) || Object.values(row).some(value => typeof value !== 'string' && !(typeof value === 'number' && Number.isFinite(value))))
      || (data.type !== undefined && ![
        'bar',
        'line',
        'area',
        'pie',
        'scatter',
      ].includes(String(data.type)))) {
      return undefined
    }
    // 已验证数据值和有限图形枚举，不透传未验证的 JSON 属性。
    return {
      type: data.type as ChartProps['type'],
      data: data.data as ChartProps['data'],
      x: data.x,
      y: data.y as string | string[],
    }
  }
  catch { return undefined }
}

/**
 * 媒体和下载地址拒绝可执行协议，服务端仍须核验地址与资源授权。
 * @example 模块内部上下文
 * ```ts
 * const url = artifactMediaUrl('/api/artifact/content?id=report')
 * ```
 */
export function artifactMediaUrl(value: string | undefined): string | undefined {
  if (!value || !/^(?:https?:|blob:|\/|\.\.?\/)/i.test(value))
    return undefined
  try {
    const url = new URL(value, 'https://artifact.invalid')
    return !url.username && !url.password
      ? value
      : undefined
  }
  catch { return undefined }
}

/**
 * 为四种可编辑产物生成最小可操作模板，业务文案由当前 UI 语言提供。
 * @example 模块内部上下文
 * ```ts
 * const content = newArtifactContent('markdown', '报告', '开始编辑', '名称', '数值', '点击')
 * ```
 */
export function newArtifactContent(kind: ArtifactCreateRequest['kind'], title: string, body: string, label: string, value: string, button: string): string {
  if (kind === 'html')
    return `<!doctype html>\n<html><head><meta charset="utf-8"><style>body{font-family:system-ui;padding:2rem}button{padding:.6rem 1rem;margin-right:1rem}</style></head><body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p><button onclick="document.querySelector('output').textContent=Number(document.querySelector('output').textContent)+1">${escapeHtml(button)}</button><output>0</output></body></html>`
  if (kind === 'table') {
    return JSON.stringify({
      table_columns: [
        { key: 'name', label, type: 'text' },
        { key: 'value', label: value, type: 'number' },
      ],
      table_rows: [
        { row_id: 'row-1', name: 'A', value: 10 },
        { row_id: 'row-2', name: 'B', value: 20 },
      ],
    }, null, 2)
  }
  if (kind === 'chart') {
    return JSON.stringify({
      type: 'bar',
      data: [
        { name: 'A', value: 10 },
        { name: 'B', value: 20 },
      ],
      x: 'name',
      y: 'value',
    }, null, 2)
  }
  return `# ${title.replace(/[\\`*_[\]<>#]/g, '\\$&')}\n\n${body}\n`
}
