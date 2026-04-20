/**
 * 表格列支持的数据类型。
 * - `text`: 普通文本输入
 * - `number`: 数值输入（前端仍按字符串回传，避免输入中间态被强转）
 * - `tag`: 标签样式输入，用于优先级、状态等枚举文本
 */
export type AiTableColumnType = 'text' | 'number' | 'tag'

export interface AiTableColumn {
  /** 列唯一键，必须和每行对象中的字段名一一对应。 */
  key: string
  /** 列头展示文案。 */
  label: string
  /** 当前列的输入与渲染类型。 */
  type: AiTableColumnType
}

export interface AiTableRow {
  /** 行唯一标识；编辑、删除和流式合并都依赖它做稳定匹配。 */
  row_id: string
  /** 行内任意单元格值，键名需对应 `table_columns[].key`。 */
  [key: string]: string | number | null | undefined
}

export interface AiTableData {
  /** 列定义，按数组顺序渲染表头和单元格。 */
  table_columns: AiTableColumn[]
  /** 行数据，按数组顺序展示。 */
  table_rows: AiTableRow[]
}

/**
 * 表格变更来源，用于上层做埋点或按动作类型分流保存策略。
 */
export type AiTableEditorChangeAction = 'replace' | 'cell-update' | 'row-add' | 'row-delete'

export interface AiTableEditorChangePayload {
  /** 本次变更动作类型。 */
  action: AiTableEditorChangeAction
  /** 变更后的完整表格快照。 */
  nextData: AiTableData
  /** 命中的行 id；`replace` 动作下可为空。 */
  rowId?: string
  /** 命中的列 key；仅单元格编辑时存在。 */
  columnKey?: string
  /** 单元格编辑后的值；仅单元格编辑时存在。 */
  value?: string
}

export interface AiTableCopyPayload {
  /** 当前复制时的结构化表格数据。 */
  data: AiTableData
  /** 复制到剪贴板的文本内容（TSV）。 */
  text: string
}

export interface AiTableDownloadPayload {
  /** 当前下载时的结构化表格数据。 */
  data: AiTableData
  /** 下载内容（CSV）。 */
  csv: string
  /** 推荐文件名（已带 `.csv` 后缀）。 */
  filename: string
}

export interface AiTableEditorProps {
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
