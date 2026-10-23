import type { DataAttributes } from '../../../../types.js'

/**
 * 表格列支持的数据类型。
 * - `text`: 普通文本输入
 * - `number`: 数值输入（前端仍按字符串回传，避免输入中间态被强转）
 * - `tag`: 标签样式输入，用于优先级、状态等枚举文本
 *
 * @example
 * ```ts
 * import type { AiTableColumnType } from '@h-ai/ui'
 * const example: AiTableColumnType = 'number'
 * ```
 */
export type AiTableColumnType = 'text' | 'number' | 'tag'

/**
 * AI 表格列的稳定字段名、标题和编辑类型。
 *
 * @example
 * ```ts
 * import type { AiTableColumn } from '@h-ai/ui'
 * const example: AiTableColumn = { key: 'sales', label: '销量', type: 'number' }
 * ```
 */
export interface AiTableColumn {
  /** 列唯一键，必须和每行对象中的字段名一一对应。 */
  key: string
  /** 列头展示文案。 */
  label: string
  /** 当前列的输入与渲染类型。 */
  type: AiTableColumnType
}

/**
 * 带稳定 row_id 的表格行；其余字段按列 key 访问。
 *
 * @example
 * ```ts
 * import type { AiTableRow } from '@h-ai/ui'
 * const example: AiTableRow = { row_id: 'r1', sales: 42 }
 * ```
 */
export interface AiTableRow {
  /** 行唯一标识；编辑、删除和流式合并都依赖它做稳定匹配。 */
  row_id: string
  /**
   * 行内任意单元格值，键名需对应 `table_columns[].key`。
   *
   * @remarks
   * viewer 侧会接历史草稿、structured payload 和流式中间态，值类型不能过早收死。
   * 组件内部会在渲染/复制/下载时统一做字符串化兜底。
   */
  [key: string]: unknown
}

/**
 * AI 表格的完整列定义和行快照，交给编辑器进行受控展示与编辑。
 *
 * @example
 * ```ts
 * import type { AiTableData } from '@h-ai/ui'
 * const example: AiTableData = { table_columns: [{ key: 'sales', label: '销量', type: 'number' }], table_rows: [{ row_id: 'r1', sales: 42 }] }
 * ```
 */
export interface AiTableData {
  /** 列定义，按数组顺序渲染表头和单元格。 */
  table_columns: AiTableColumn[]
  /** 行数据，按数组顺序展示。 */
  table_rows: AiTableRow[]
}

/**
 * 表格变更来源，用于上层做埋点或按动作类型分流保存策略。
 *
 * @example
 * ```ts
 * import type { AiTableEditorChangeAction } from '@h-ai/ui'
 * const example: AiTableEditorChangeAction = 'cell-update'
 * ```
 */
export type AiTableEditorChangeAction
  = | 'replace'
    | 'cell-update'
    | 'row-add'
    | 'row-delete'
    | 'row-reorder'

/**
 * 表格修改后的完整快照及动作定位信息；宿主据此保存，而不是依赖内部草稿。
 *
 * @example
 * ```ts
 * import type { AiTableEditorChangePayload } from '@h-ai/ui'
 * const example: AiTableEditorChangePayload = { action: 'cell-update', rowId: 'r1', columnKey: 'sales', value: '43', nextData: { table_columns: [{ key: 'sales', label: '销量', type: 'number' }], table_rows: [{ row_id: 'r1', sales: 43 }] } }
 * ```
 */
export interface AiTableEditorChangePayload {
  /** 本次变更动作类型。 */
  action: AiTableEditorChangeAction
  /** 变更后的完整表格快照。 */
  nextData: AiTableData
  /** 命中的行 id；`replace` 动作下可为空，`row-reorder` 下表示被拖动的行。 */
  rowId?: string
  /** 命中的列 key；仅单元格编辑时存在。 */
  columnKey?: string
  /** 单元格编辑后的值；仅单元格编辑时存在。 */
  value?: string
  /** 行重排时命中的参考行 id；用于还原“拖到哪一行附近”的上下文。 */
  targetRowId?: string
  /** 行重排前的索引；仅 `row-reorder` 时存在。 */
  fromIndex?: number
  /** 行重排后的索引；仅 `row-reorder` 时存在。 */
  toIndex?: number
}

/**
 * 表格复制回调，包含当前数据和可交给剪贴板的纯文本。
 *
 * @example
 * ```ts
 * import type { AiTableCopyPayload } from '@h-ai/ui'
 * const example: AiTableCopyPayload = { data: { table_columns: [{ key: 'sales', label: '销量', type: 'number' }], table_rows: [{ row_id: 'r1', sales: 42 }] }, text: '销量\n42' }
 * ```
 */
export interface AiTableCopyPayload {
  /** 当前复制时的结构化表格数据。 */
  data: AiTableData
  /** 复制到剪贴板的文本内容（TSV）。 */
  text: string
}

/**
 * 表格下载回调，包含当前数据、CSV 正文和建议文件名。
 *
 * @example
 * ```ts
 * import type { AiTableDownloadPayload } from '@h-ai/ui'
 * const example: AiTableDownloadPayload = { data: { table_columns: [{ key: 'sales', label: '销量', type: 'number' }], table_rows: [{ row_id: 'r1', sales: 42 }] }, csv: '销量\n42', filename: 'sales.csv' }
 * ```
 */
export interface AiTableDownloadPayload {
  /** 当前下载时的结构化表格数据。 */
  data: AiTableData
  /** 下载内容（CSV）。 */
  csv: string
  /** 推荐文件名（已带 `.csv` 后缀）。 */
  filename: string
}

/**
 * AI 表格编辑器的输入快照、展示状态和宿主保存/复制/下载回调。
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { AiTableEditor } from '@h-ai/ui'
 *   import type { AiTableEditorProps } from '@h-ai/ui'
 *   const props: AiTableEditorProps = { title: '销量', tableData: { table_columns: [{ key: 'sales', label: '销量', type: 'number' }], table_rows: [{ row_id: 'r1', sales: 42 }] } }
 * </script>
 * <AiTableEditor {...props} />
 * ```
 */
export interface AiTableEditorProps extends DataAttributes {
  /** 原始表格内容字符串，通常是 JSON 文本，支持流式残缺片段。 */
  content?: string
  /** 结构化表格数据；有值时优先于 `content`。 */
  tableData?: AiTableData
  /** 表格标题。 */
  title?: string
  /** 外层容器自定义类名。 */
  class?: string
  /** 暴露给外层的滚动容器引用，便于外层同步滚动行为。 */
  editorScrollHost?: HTMLDivElement | null
  /** 头部状态文案。 */
  statusText?: string
  /** 头部辅助文案。 */
  metaText?: string
  /** 头部保存状态文案。 */
  saveState?: string
  /** 是否允许编辑单元格与行操作。 */
  editable?: boolean
  /** 关闭按钮是否禁用。 */
  closeDisabled?: boolean
  /** 关闭回调。 */
  onclose?: () => void
  /** 表格变更回调，后续可直接对接保存接口。 */
  ontablechange?: (
    payload: AiTableEditorChangePayload,
  ) => void | Promise<void>
  /** 表格容器滚动回调，便于外层同步“自动跟随到底部”等策略。 */
  ondocumentscroll?: (event: Event) => void
  /** 复制回调；不传则走组件内置剪贴板逻辑。 */
  oncopytable?: (
    payload: AiTableCopyPayload,
  ) => void | Promise<void>
  /** 下载回调；不传则走组件内置浏览器下载逻辑。 */
  ondownloadtable?: (
    payload: AiTableDownloadPayload,
  ) => void | Promise<void>
}
