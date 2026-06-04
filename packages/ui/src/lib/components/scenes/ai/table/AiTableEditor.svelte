<!--
  =============================================================================
  @h-ai/ui - AiTableEditor 组件
  =============================================================================
  面向 AI 场景的可编辑表格查看器，支持：
  - 从结构化数据或 JSON 文本渲染表格
  - 流式残缺 JSON 的增量容错解析（列/行可分段出现）
  - 单元格编辑、行新增、行删除、拖拽排序
  - 复制表格（TSV）与下载表格（CSV）

  使用 Svelte 5 Runes ($props, $state, $derived, $effect)
  =============================================================================
-->
<script lang='ts'>
  import type { MarkdownToolbarDownloadAction } from '../document-types.js'
  import type {
    AiTableColumn,
    AiTableColumnType,
    AiTableData,
    AiTableDownloadPayload,
    AiTableEditorChangePayload,
    AiTableEditorProps,
  } from './table-types.js'
  import { SvelteSet } from 'svelte/reactivity'
  import { uiM } from '../../../../messages.js'
  import { cn } from '../../../../utils.js'
  import AiDocumentDownloadMenu from '../AiDocumentDownloadMenu.svelte'

  interface ExtractedArrayChunk {
    /** 从原始字符串里截取到的数组片段（可能是不完整数组）。 */
    source: string
    /** 是否已经拿到完整闭合的 `[...]`。 */
    complete: boolean
  }

  type AiTableRowDropPosition = 'before' | 'after'

  interface ReorderedTableResult {
    /** 重排后的完整表格快照；未真正变更顺序时为 `null`。 */
    nextData: AiTableData | null
    /** 被拖动行原本所在的索引。 */
    fromIndex: number
    /** 被拖动行落位后的索引；无变化时与 `fromIndex` 相同。 */
    toIndex: number
  }

  // 顶部复制按钮在“复制成功”态和默认态之间切换时复用内联 SVG，避免重复拼接 DOM 片段。
  const COPY_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 9a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9Zm2 0v9h9v-9h-9Z"></path><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1h-2V4H4v9h1v2Z"></path></svg>`
  const CHECK_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.55 18.35-5.2-5.2 1.42-1.41 3.78 3.78 8.68-8.68 1.42 1.41-10.1 10.1Z"></path></svg>`
  const CLOSE_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7l-1.4-1.4L9.2 12 2.9 5.7l1.4-1.4 6.3 6.3 6.3-6.3 1.4 1.4Z"></path></svg>`
  const DELETE_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.72 6.72a.75.75 0 0 1 1.06 0L12 10.94l4.22-4.22a.75.75 0 1 1 1.06 1.06L13.06 12l4.22 4.22a.75.75 0 1 1-1.06 1.06L12 13.06l-4.22 4.22a.75.75 0 1 1-1.06-1.06L10.94 12 6.72 7.78a.75.75 0 0 1 0-1.06Z"></path></svg>`
  const PLUS_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z"></path></svg>`
  const DRAG_HANDLE_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.75a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5Zm0 5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5Zm0 5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5ZM16 5.75a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5Zm0 5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5Zm0 5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5Z"></path></svg>`
  const TABLE_DOWNLOAD_ACTION_ID = 'table-csv'
  // 文件名过滤正则，避免下载时包含平台不兼容字符。
  const INVALID_FILENAME_CHARS_REGEX = /[<>:"/\\|?*]+/g
  // 单元格值中的双引号需要按 CSV 规范转义为两个双引号。
  const CSV_DOUBLE_QUOTE_REGEX = /"/g
  const CANONICAL_TABLE_CONTENT_HINTS = ['table/v1', '"columns"', '"rows"'] as const
  const EDITOR_TABLE_CONTENT_HINTS = ['"table_columns"', '"table_rows"'] as const
  // 单元格输入对外回调统一防抖 2 秒，避免父层每次敲字都触发保存链路。
  const TABLE_CELL_CHANGE_DEBOUNCE_MS = 2000

  let {
    // 暴露给外层的滚动容器引用，用于流式自动滚动。
    editorScrollHost = $bindable<HTMLDivElement | null>(null),
    // 原始表格内容，通常是 JSON 字符串，可能是流式中间态。
    content = '',
    // 结构化表格数据；存在时优先用于渲染和编辑。
    tableData,
    // 头部标题。
    title = '',
    // 外层自定义类名。
    class: className = '',
    // 头部状态文案。
    statusText = '',
    // 头部辅助文案。
    metaText = '',
    // 头部保存状态文案。
    saveState = '',
    // 是否允许编辑表格。
    editable = true,
    // 关闭按钮是否禁用。
    closeDisabled = false,
    // 关闭回调。
    onclose,
    // 表格编辑回调。
    ontablechange,
    // 表格滚动回调。
    ondocumentscroll,
    // 表格复制回调。
    oncopytable,
    // 表格下载回调。
    ondownloadtable,
  }: AiTableEditorProps = $props()

  // 复制反馈只影响右上角复制按钮，不和业务数据混用。
  let copied = $state(false)
  // 连续复制时按最后一次点击重新计时。
  let copyFeedbackTimer: number | undefined = $state()
  // draggingRowId 只在原生拖拽生命周期内存在，用来确定当前正在移动哪一行。
  let draggingRowId = $state<string | null>(null)
  // dragTargetRowId 记录当前悬停的参考行，配合插入方向绘制拖拽指示线。
  let dragTargetRowId = $state<string | null>(null)
  // dragTargetPosition 标识应插入到参考行前面还是后面。
  let dragTargetPosition = $state<AiTableRowDropPosition | null>(null)
  // 本地表格草稿让输入中的单元格先在组件内即时生效，再按防抖节奏同步给外层。
  let localDraftTableData = $state<AiTableData | null>(null)
  // pendingCellChangePayload 保存尚未对外发出的最后一次单元格修改。
  let pendingCellChangePayload = $state<AiTableEditorChangePayload | null>(null)
  // 单元格修改回调的防抖计时器。
  let cellChangeTimer: number | undefined = $state()
  // 用上一版入参快照判断当前是“父层追平本地草稿”还是“切到了另一份表格”。
  let lastIncomingTableSignature = $state('')

  // 当上层没传结构化表格时，尝试从 `content` 里做容错解析。
  const parsedTableData = $derived(parseTableDataFromSource(content))
  // 输入源统一先归一化，方便后续比较父层快照与本地草稿是否已对齐。
  const sourceTableData = $derived(
    normalizeTableData(
      tableData ?? parsedTableData ?? {
        table_columns: [],
        table_rows: [],
      },
    ),
  )
  // 渲染时优先展示本地草稿；父层追平后再回退到受控值。
  const resolvedTableData = $derived(localDraftTableData ?? sourceTableData)
  // 表格列定义，保持单独派生避免模板重复读取深层对象。
  const tableColumns = $derived(resolvedTableData.table_columns)
  // 表格行定义，保持单独派生避免模板重复读取深层对象。
  const tableRows = $derived(resolvedTableData.table_rows)
  // 表格主体容器类名，避免样式拼接散落在模板中。
  const tablePaneClass = $derived(cn('hai-ai-table-pane', className))

  $effect(() => {
    return () => {
      clearScheduledCellChange()
      if (copyFeedbackTimer) {
        window.clearTimeout(copyFeedbackTimer)
      }
    }
  })

  $effect(() => {
    const incomingSignature = serializeTableDataForComparison(sourceTableData)
    const previousIncomingSignature = lastIncomingTableSignature
    lastIncomingTableSignature = incomingSignature

    if (!localDraftTableData) {
      return
    }

    const localSignature = serializeTableDataForComparison(localDraftTableData)
    if (incomingSignature === localSignature) {
      localDraftTableData = null
      pendingCellChangePayload = null
      clearScheduledCellChange()
      return
    }

    // 父层切到了另一份表格时，本地未提交的输入不能继续覆盖新表格。
    if (previousIncomingSignature && incomingSignature !== previousIncomingSignature) {
      localDraftTableData = null
      pendingCellChangePayload = null
      clearScheduledCellChange()
    }
  })

  $effect(() => {
    const currentTableRows = tableRows

    if (!editable || currentTableRows.length < 2) {
      resetRowDragState()
      return
    }

    if (draggingRowId && !currentTableRows.some(row => row.row_id === draggingRowId)) {
      resetRowDragState()
      return
    }

    if (dragTargetRowId && !currentTableRows.some(row => row.row_id === dragTargetRowId)) {
      dragTargetRowId = null
      dragTargetPosition = null
    }
  })

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
  }

  function normalizeColumnType(value: unknown): AiTableColumnType {
    return value === 'number' || value === 'tag' ? value : 'text'
  }

  function serializeTableDataForComparison(
    data: AiTableData | null | undefined,
  ): string {
    if (!data) {
      return ''
    }

    try {
      return JSON.stringify(data)
    }
    catch {
      return ''
    }
  }

  /**
   * 列定义归一化：
   * - 过滤非对象项和空 key
   * - 自动填充 label/type 缺省值
   * - 基于 `key` 去重，避免流式增量里重复列导致渲染抖动
   */
  function normalizeTableColumns(items: unknown[]): AiTableColumn[] {
    const usedKeys = new SvelteSet<string>()
    const columns: AiTableColumn[] = []

    for (const item of items) {
      if (!isRecord(item)) {
        continue
      }

      const key = typeof item.key === 'string' && item.key.trim()
        ? item.key.trim()
        : (typeof item.name === 'string' ? item.name.trim() : '')
      if (!key || usedKeys.has(key)) {
        continue
      }

      const label = typeof item.label === 'string' && item.label.trim()
        ? item.label.trim()
        : (typeof item.name === 'string' && item.name.trim()
        ? item.name.trim()
        : key)

      columns.push({
        key,
        label,
        type: normalizeColumnType(item.type),
      })
      usedKeys.add(key)
    }

    return columns
  }

  /**
   * 行定义归一化：
   * - 过滤非对象项
   * - 兜底生成 row_id，保证模板 key 稳定
   */
  function normalizeTableRows(items: unknown[]): AiTableData['table_rows'] {
    const rows: AiTableData['table_rows'] = []

    for (const [index, item] of items.entries()) {
      if (!isRecord(item)) {
        continue
      }

      const rowId = typeof item.row_id === 'string' && item.row_id.trim()
        ? item.row_id.trim()
        : `row_${index + 1}`

      rows.push({
        ...item,
        row_id: rowId,
      })
    }

    return rows
  }

  /**
   * 表格对象统一归一，避免模板层处理结构健壮性。
   */
  function normalizeTableData(data: AiTableData): AiTableData {
    return {
      table_columns: normalizeTableColumns(data.table_columns),
      table_rows: normalizeTableRows(data.table_rows),
    }
  }

  function tryParseJson(value: string): unknown {
    try {
      return JSON.parse(value)
    }
    catch {
      return undefined
    }
  }

  /**
   * 从 JSON 字符串中提取指定 key 的数组片段。
   * 该函数支持“流式未闭合数组”场景：拿不到 `]` 时也会返回已截取片段并标记 `complete=false`。
   */
  function extractArrayChunkByKey(
    source: string,
    key: 'columns' | 'rows' | 'table_columns' | 'table_rows',
  ): ExtractedArrayChunk | null {
    const keyIndex = source.indexOf(`"${key}"`)
    if (keyIndex < 0) {
      return null
    }

    const arrayStart = source.indexOf('[', keyIndex)
    if (arrayStart < 0) {
      return null
    }

    let depth = 0
    let escaped = false
    let inString = false

    for (let index = arrayStart; index < source.length; index += 1) {
      const char = source[index]

      if (inString) {
        if (escaped) {
          escaped = false
          continue
        }

        if (char === '\\') {
          escaped = true
          continue
        }

        if (char === '"') {
          inString = false
        }
        continue
      }

      if (char === '"') {
        inString = true
        continue
      }

      if (char === '[') {
        depth += 1
        continue
      }

      if (char === ']') {
        depth -= 1
        if (depth === 0) {
          return {
            source: source.slice(arrayStart, index + 1),
            complete: true,
          }
        }
      }
    }

    return {
      source: source.slice(arrayStart),
      complete: false,
    }
  }

  /**
   * 当数组尚未闭合时，从片段中逐个提取已闭合对象。
   * 这样能保证“行一条条流出来”时，已完成的行可以先展示。
   */
  function parseObjectListFromArrayChunk(
    source: string,
  ): Array<Record<string, unknown>> {
    const objects: Array<Record<string, unknown>> = []
    let objectDepth = 0
    let objectStart = -1
    let escaped = false
    let inString = false

    for (let index = 0; index < source.length; index += 1) {
      const char = source[index]

      if (inString) {
        if (escaped) {
          escaped = false
          continue
        }

        if (char === '\\') {
          escaped = true
          continue
        }

        if (char === '"') {
          inString = false
        }
        continue
      }

      if (char === '"') {
        inString = true
        continue
      }

      if (char === '{') {
        if (objectDepth === 0) {
          objectStart = index
        }
        objectDepth += 1
        continue
      }

      if (char === '}') {
        objectDepth -= 1
        if (objectDepth === 0 && objectStart >= 0) {
          const chunk = source.slice(objectStart, index + 1)
          const parsed = tryParseJson(chunk)
          if (isRecord(parsed)) {
            objects.push(parsed)
          }
          objectStart = -1
        }
      }
    }

    return objects
  }

  function parseTableColumnsFromChunk(
    chunk: ExtractedArrayChunk,
  ): AiTableColumn[] {
    if (chunk.complete) {
      const parsed = tryParseJson(chunk.source)
      if (Array.isArray(parsed)) {
        return normalizeTableColumns(parsed)
      }
    }

    return normalizeTableColumns(parseObjectListFromArrayChunk(chunk.source))
  }

  function parseTableRowsFromChunk(
    chunk: ExtractedArrayChunk,
  ): AiTableData['table_rows'] {
    if (chunk.complete) {
      const parsed = tryParseJson(chunk.source)
      if (Array.isArray(parsed)) {
        return normalizeTableRows(parsed)
      }
    }

    return normalizeTableRows(parseObjectListFromArrayChunk(chunk.source))
  }

  /**
   * 容错解析表格数据：
   * 1. 优先尝试完整 JSON；
   * 2. 失败后按 key 提取数组片段，支持流式中间态；
   * 3. 仅当列和行都无法解析时返回 `null`。
   */
  function parseTableDataFromSource(source: string): AiTableData | null {
    const trimmed = source.trim()
    if (!trimmed) {
      return null
    }

    const matchesCanonicalContent = CANONICAL_TABLE_CONTENT_HINTS.some(
      marker => trimmed.includes(marker),
    )
    const matchesEditorContent = EDITOR_TABLE_CONTENT_HINTS.some(
      marker => trimmed.includes(marker),
    )
    if (!matchesCanonicalContent && !matchesEditorContent) {
      return null
    }

    const parsedWhole = tryParseJson(trimmed)
    if (isRecord(parsedWhole)) {
      const columns = Array.isArray(parsedWhole.table_columns)
        ? normalizeTableColumns(parsedWhole.table_columns)
        : (Array.isArray(parsedWhole.columns) ? normalizeTableColumns(parsedWhole.columns) : [])
      const rows = Array.isArray(parsedWhole.table_rows)
        ? normalizeTableRows(parsedWhole.table_rows)
        : (Array.isArray(parsedWhole.rows) ? normalizeTableRows(parsedWhole.rows) : [])

      if (columns.length > 0 || rows.length > 0) {
        return {
          table_columns: columns,
          table_rows: rows,
        }
      }
    }

    const columnsChunk = extractArrayChunkByKey(
      trimmed,
      matchesEditorContent ? 'table_columns' : 'columns',
    )
    const rowsChunk = extractArrayChunkByKey(
      trimmed,
      matchesEditorContent ? 'table_rows' : 'rows',
    )
    if (!columnsChunk && !rowsChunk) {
      return null
    }

    const columns = columnsChunk ? parseTableColumnsFromChunk(columnsChunk) : []
    const rows = rowsChunk ? parseTableRowsFromChunk(rowsChunk) : []
    if (columns.length === 0 && rows.length === 0) {
      return null
    }

    return {
      table_columns: columns,
      table_rows: rows,
    }
  }

  function getCellValue(row: AiTableData['table_rows'][number], key: string): string {
    const value = row[key]
    if (typeof value === 'number') {
      return `${value}`
    }

    if (typeof value === 'string') {
      return value
    }

    if (typeof value === 'boolean') {
      return `${value}`
    }

    if (value === null || value === undefined) {
      return ''
    }

    try {
      return JSON.stringify(value)
    }
    catch {
      return ''
    }
  }

  function getCellInputValue(row: AiTableData['table_rows'][number], key: string): string {
    return getCellValue(row, key)
  }

  function getCellExportValue(row: AiTableData['table_rows'][number], key: string): string {
    return getCellValue(row, key)
  }

  function createGeneratedRowId(): string {
    return `row_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  }

  function buildNextTableDataWithCellUpdate(
    data: AiTableData,
    rowId: string,
    columnKey: string,
    value: string,
  ): AiTableData {
    return {
      table_columns: data.table_columns,
      table_rows: data.table_rows.map((row) => {
        if (row.row_id !== rowId) {
          return row
        }

        return {
          ...row,
          [columnKey]: value,
        }
      }),
    }
  }

  function buildNextTableDataWithRowAdd(data: AiTableData): AiTableData {
    const newRow: AiTableData['table_rows'][number] = {
      row_id: createGeneratedRowId(),
    }

    for (const column of data.table_columns) {
      newRow[column.key] = ''
    }

    return {
      table_columns: data.table_columns,
      table_rows: [...data.table_rows, newRow],
    }
  }

  function buildNextTableDataWithRowDelete(
    data: AiTableData,
    rowId: string,
  ): AiTableData {
    return {
      table_columns: data.table_columns,
      table_rows: data.table_rows.filter(row => row.row_id !== rowId),
    }
  }

  /**
   * 行重排时先把拖动行临时移出数组，再按悬停位置重新插回。
   * 这样可以统一处理“向上拖”和“向下拖”，避免索引在删除后发生偏移。
   */
  function buildNextTableDataWithRowReorder(
    data: AiTableData,
    rowId: string,
    targetRowId: string,
    position: AiTableRowDropPosition,
  ): ReorderedTableResult {
    const fromIndex = data.table_rows.findIndex(row => row.row_id === rowId)
    const targetIndex = data.table_rows.findIndex(row => row.row_id === targetRowId)

    if (fromIndex < 0 || targetIndex < 0 || fromIndex === targetIndex) {
      return {
        nextData: null,
        fromIndex,
        toIndex: fromIndex,
      }
    }

    const nextRows = [...data.table_rows]
    const [movedRow] = nextRows.splice(fromIndex, 1)
    if (!movedRow) {
      return {
        nextData: null,
        fromIndex,
        toIndex: fromIndex,
      }
    }

    const targetIndexAfterRemoval = nextRows.findIndex(row => row.row_id === targetRowId)
    if (targetIndexAfterRemoval < 0) {
      return {
        nextData: null,
        fromIndex,
        toIndex: fromIndex,
      }
    }

    const insertionIndex = position === 'before'
      ? targetIndexAfterRemoval
      : targetIndexAfterRemoval + 1

    nextRows.splice(insertionIndex, 0, movedRow)
    const toIndex = nextRows.findIndex(row => row.row_id === rowId)
    if (toIndex === fromIndex) {
      return {
        nextData: null,
        fromIndex,
        toIndex,
      }
    }

    return {
      nextData: {
        table_columns: data.table_columns,
        table_rows: nextRows,
      },
      fromIndex,
      toIndex,
    }
  }

  function clearScheduledCellChange(): void {
    if (typeof window === 'undefined' || !cellChangeTimer) {
      return
    }

    window.clearTimeout(cellChangeTimer)
    cellChangeTimer = undefined
  }

  function emitTableChange(payload: AiTableEditorChangePayload): void {
    void ontablechange?.(payload)
  }

  function discardPendingCellChange(): void {
    pendingCellChangePayload = null
    clearScheduledCellChange()
  }

  export function flushPendingTableChange(): void {
    const pendingPayload = pendingCellChangePayload
    if (!pendingPayload) {
      return
    }

    discardPendingCellChange()
    emitTableChange(pendingPayload)
  }

  function queueCellChange(payload: AiTableEditorChangePayload): void {
    localDraftTableData = payload.nextData
    pendingCellChangePayload = payload

    if (!ontablechange) {
      clearScheduledCellChange()
      return
    }

    if (typeof window === 'undefined') {
      flushPendingTableChange()
      return
    }

    clearScheduledCellChange()
    cellChangeTimer = window.setTimeout(() => {
      cellChangeTimer = undefined
      flushPendingTableChange()
    }, TABLE_CELL_CHANGE_DEBOUNCE_MS)
  }

  function emitImmediateTableChange(payload: AiTableEditorChangePayload): void {
    localDraftTableData = payload.nextData
    discardPendingCellChange()
    emitTableChange(payload)
  }

  function resetRowDragState(): void {
    draggingRowId = null
    dragTargetRowId = null
    dragTargetPosition = null
  }

  function resolveRowDropPosition(event: DragEvent): AiTableRowDropPosition | null {
    const currentTarget = event.currentTarget
    if (!(currentTarget instanceof HTMLTableRowElement)) {
      return null
    }

    const rowBounds = currentTarget.getBoundingClientRect()
    return event.clientY < rowBounds.top + rowBounds.height / 2 ? 'before' : 'after'
  }

  function updateRowDropHint(rowId: string, event: DragEvent): void {
    if (!draggingRowId || draggingRowId === rowId) {
      dragTargetRowId = null
      dragTargetPosition = null
      return
    }

    const position = resolveRowDropPosition(event)
    if (!position) {
      return
    }

    dragTargetRowId = rowId
    dragTargetPosition = position
  }

  function handleCellInput(
    rowId: string,
    column: AiTableColumn,
    event: Event,
  ): void {
    const target = event.currentTarget
    if (!(target instanceof HTMLInputElement)) {
      return
    }

    const value = target.value
    const nextData = buildNextTableDataWithCellUpdate(
      resolvedTableData,
      rowId,
      column.key,
      value,
    )

    queueCellChange({
      action: 'cell-update',
      rowId,
      columnKey: column.key,
      value,
      nextData,
    })
  }

  function handleAddRow(): void {
    const nextData = buildNextTableDataWithRowAdd(resolvedTableData)
    const rowId = nextData.table_rows.at(-1)?.row_id

    emitImmediateTableChange({
      action: 'row-add',
      rowId,
      nextData,
    })
  }

  function handleDeleteRow(rowId: string): void {
    const nextData = buildNextTableDataWithRowDelete(resolvedTableData, rowId)

    emitImmediateTableChange({
      action: 'row-delete',
      rowId,
      nextData,
    })
  }

  function handleRowDragStart(rowId: string, event: DragEvent): void {
    if (!editable || tableRows.length < 2) {
      event.preventDefault()
      return
    }

    draggingRowId = rowId
    dragTargetRowId = null
    dragTargetPosition = null

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      // Firefox 需要至少写入一份文本数据，拖拽事件链才能正常继续。
      event.dataTransfer.setData('text/plain', rowId)
    }
  }

  function handleRowDragOver(rowId: string, event: DragEvent): void {
    if (!draggingRowId) {
      return
    }

    event.preventDefault()
    updateRowDropHint(rowId, event)

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move'
    }
  }

  function handleRowDrop(rowId: string, event: DragEvent): void {
    if (!draggingRowId) {
      return
    }

    event.preventDefault()
    const position = resolveRowDropPosition(event)
    if (!position) {
      resetRowDragState()
      return
    }

    const draggedRowId = draggingRowId
    const result = buildNextTableDataWithRowReorder(
      resolvedTableData,
      draggedRowId,
      rowId,
      position,
    )

    resetRowDragState()
    if (!result.nextData) {
      return
    }

    emitImmediateTableChange({
      action: 'row-reorder',
      rowId: draggedRowId,
      targetRowId: rowId,
      fromIndex: result.fromIndex,
      toIndex: result.toIndex,
      nextData: result.nextData,
    })
  }

  function isDropIndicatorVisible(
    rowId: string,
    position: AiTableRowDropPosition,
  ): boolean {
    return dragTargetRowId === rowId && dragTargetPosition === position
  }

  function serializeTableAsTsv(data: AiTableData): string {
    const header = data.table_columns.map(column => column.label).join('\t')
    const body = data.table_rows.map((row) => {
      return data.table_columns
        .map(column => getCellExportValue(row, column.key).replace(/\t/g, ' '))
        .join('\t')
    })

    return [header, ...body].filter(Boolean).join('\n')
  }

  function escapeCsvCell(value: string): string {
    return `"${value.replace(CSV_DOUBLE_QUOTE_REGEX, '""')}"`
  }

  function serializeTableAsCsv(data: AiTableData): string {
    const header = data.table_columns
      .map(column => escapeCsvCell(column.label))
      .join(',')

    const body = data.table_rows.map((row) => {
      return data.table_columns
        .map(column => escapeCsvCell(getCellExportValue(row, column.key)))
        .join(',')
    })

    return [header, ...body].filter(Boolean).join('\n')
  }

  function sanitizeFilename(value: string): string {
    const normalized = value
      .trim()
      .replace(INVALID_FILENAME_CHARS_REGEX, ' ')
      .replace(/\s+/g, ' ')
      .replace(/[. ]+$/g, '')
      .trim()

    return normalized || 'ai-table'
  }

  function resolveDownloadFilename(): string {
    return `${sanitizeFilename(title || 'ai-table')}.csv`
  }

  function resolveTableDownloadActions(): MarkdownToolbarDownloadAction[] {
    return [
      {
        id: TABLE_DOWNLOAD_ACTION_ID,
        label: uiM('table_download'),
        badgeLabel: 'CSV',
      },
    ]
  }

  function triggerCopiedFeedback(): void {
    copied = true
    if (copyFeedbackTimer) {
      window.clearTimeout(copyFeedbackTimer)
    }

    copyFeedbackTimer = window.setTimeout(() => {
      copied = false
      copyFeedbackTimer = undefined
    }, 1800)
  }

  function downloadBlob(content: string, filename: string): void {
    if (typeof document === 'undefined') {
      return
    }

    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.rel = 'noopener'
    anchor.click()
    window.setTimeout(() => {
      URL.revokeObjectURL(url)
    }, 1000)
  }

  async function handleCopyTable(): Promise<void> {
    const text = serializeTableAsTsv(resolvedTableData)
    if (!text) {
      return
    }

    if (oncopytable) {
      await oncopytable({
        data: resolvedTableData,
        text,
      })
      triggerCopiedFeedback()
      return
    }

    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      return
    }

    await navigator.clipboard.writeText(text)
    triggerCopiedFeedback()
  }

  async function handleDownloadTable(): Promise<void> {
    const csv = serializeTableAsCsv(resolvedTableData)
    if (!csv) {
      return
    }

    const filename = resolveDownloadFilename()
    const payload: AiTableDownloadPayload = {
      data: resolvedTableData,
      csv,
      filename,
    }

    if (ondownloadtable) {
      await ondownloadtable(payload)
      return
    }

    downloadBlob(csv, filename)
  }

  async function handleDownloadAction(actionId: string): Promise<void> {
    if (actionId !== TABLE_DOWNLOAD_ACTION_ID) {
      return
    }

    await handleDownloadTable()
  }

  function resolveCellInputClass(type: AiTableColumnType): string {
    if (type === 'tag') {
      return 'hai-ai-table-cell-input hai-ai-table-cell-input--tag'
    }

    if (type === 'number') {
      return 'hai-ai-table-cell-input hai-ai-table-cell-input--number'
    }

    return 'hai-ai-table-cell-input'
  }

  function resolveBodyRowClass(rowId: string): string {
    return cn(
      'hai-ai-table-body-row',
      draggingRowId === rowId ? 'hai-ai-table-body-row--dragging' : '',
      isDropIndicatorVisible(rowId, 'before')
        ? 'hai-ai-table-body-row--drop-before'
        : '',
      isDropIndicatorVisible(rowId, 'after')
        ? 'hai-ai-table-body-row--drop-after'
        : '',
    )
  }
</script>

<section class={tablePaneClass}>
  <header class='hai-ai-table-header'>
    <div class='hai-ai-table-heading'>
      <div class='hai-ai-table-eyebrow'>
        {metaText || uiM('table_editor_eyebrow')}
      </div>
      <h2 class='hai-ai-table-title' title={title || uiM('data_table_empty')}>
        {title || uiM('data_table_empty')}
      </h2>
      {#if statusText}
        <p class='hai-ai-table-status'>{statusText}</p>
      {/if}
    </div>

    <div class='hai-ai-table-toolbar'>
      {#if saveState}
        <span class='hai-ai-table-save-state'>{saveState}</span>
      {/if}

      <button
        type='button'
        class='hai-ai-table-toolbar-btn'
        title={uiM('table_copy')}
        aria-label={uiM('table_copy')}
        onclick={() => {
          void handleCopyTable()
        }}
      >
        <!-- eslint-disable-next-line svelte/no-at-html-tags -- 受控 SVG 图标渲染 -->
        {@html copied ? CHECK_ICON : COPY_ICON}
      </button>

      <AiDocumentDownloadMenu
        actions={resolveTableDownloadActions()}
        ondownload={handleDownloadAction}
        triggerTitle={uiM('table_download')}
        triggerClass='hai-ai-table-toolbar-btn hai-ai-table-toolbar-btn--download'
        menuClass='hai-ai-table-download-menu-panel'
      />

      {#if onclose}
        <button
          type='button'
          class='hai-ai-table-toolbar-btn'
          title={uiM('table_close')}
          aria-label={uiM('table_close')}
          disabled={closeDisabled}
          onclick={() => {
            flushPendingTableChange()
            onclose?.()
          }}
        >
          <!-- eslint-disable-next-line svelte/no-at-html-tags -- 受控 SVG 图标渲染 -->
          {@html CLOSE_ICON}
        </button>
      {/if}
    </div>
  </header>

  <div
    class='hai-ai-table-scroll'
    bind:this={editorScrollHost}
    onscroll={ondocumentscroll}
  >
    <table class='hai-ai-table-grid'>
      <thead>
        <tr>
          {#each tableColumns as column (column.key)}
            <th title={column.label}>{column.label}</th>
          {/each}
          {#if editable}
            <th class='hai-ai-table-action-head'>{uiM('data_table_actions')}</th>
          {/if}
        </tr>
      </thead>
      <tbody>
        {#if tableRows.length === 0}
          <tr>
            <td
              class='hai-ai-table-empty'
              colspan={tableColumns.length + (editable ? 1 : 0)}
            >
              {uiM('data_table_empty')}
            </td>
          </tr>
        {:else}
          {#each tableRows as row (row.row_id)}
            <tr
              class={resolveBodyRowClass(row.row_id)}
              ondragover={event => handleRowDragOver(row.row_id, event)}
              ondrop={event => handleRowDrop(row.row_id, event)}
            >
              {#each tableColumns as column (column.key)}
                {@const cellInputValue = getCellInputValue(row, column.key)}
                <td>
                  <input
                    class={resolveCellInputClass(column.type)}
                    type={column.type === 'number' ? 'number' : 'text'}
                    value={cellInputValue}
                    title={cellInputValue}
                    disabled={!editable}
                    oninput={event => handleCellInput(row.row_id, column, event)}
                  />
                </td>
              {/each}
              {#if editable}
                <td class='hai-ai-table-row-action'>
                  <div class='hai-ai-table-row-actions'>
                    <button
                      type='button'
                      class='hai-ai-table-row-handle'
                      title={uiM('table_reorder_row')}
                      aria-label={uiM('table_reorder_row')}
                      aria-grabbed={draggingRowId === row.row_id}
                      disabled={tableRows.length < 2}
                      draggable={tableRows.length > 1}
                      ondragstart={event => handleRowDragStart(row.row_id, event)}
                      ondragend={resetRowDragState}
                    >
                      <!-- eslint-disable-next-line svelte/no-at-html-tags -- 受控 SVG 图标渲染 -->
                      {@html DRAG_HANDLE_ICON}
                    </button>

                    <button
                      type='button'
                      class='hai-ai-table-row-delete'
                      title={uiM('table_delete_row')}
                      aria-label={uiM('table_delete_row')}
                      onclick={() => handleDeleteRow(row.row_id)}
                    >
                      <!-- eslint-disable-next-line svelte/no-at-html-tags -- 受控 SVG 图标渲染 -->
                      {@html DELETE_ICON}
                    </button>
                  </div>
                </td>
              {/if}
            </tr>
          {/each}
        {/if}

        {#if editable}
          <tr class='hai-ai-table-add-row'>
            <td colspan={tableColumns.length + 1}>
              <button
                type='button'
                class='hai-ai-table-add-btn'
                title={uiM('table_add_row')}
                aria-label={uiM('table_add_row')}
                onclick={handleAddRow}
              >
                <!-- eslint-disable-next-line svelte/no-at-html-tags -- 受控 SVG 图标渲染 -->
                {@html PLUS_ICON}
                <span>{uiM('table_add_row')}</span>
              </button>
            </td>
          </tr>
        {/if}
      </tbody>
    </table>
  </div>
</section>

<style>
  .hai-ai-table-pane {
    /*
      主题变量兼容层：
      - hai-mate Web 端主要使用 daisyUI v5 的 `--color-*` 语义变量；
      - 组件库内部分场景仍可能提供旧版 `--b1/--bc/--p` 通道变量；
      - 这里统一抽象为 AiTableEditor 私有变量，确保在两套主题体系下都能稳定着色。
    */
    --hai-ai-table-bg: var(--color-base-100, oklch(var(--b1, 1 0 0)));
    --hai-ai-table-bg-soft: var(--color-base-200, oklch(var(--b2, 0.97 0 0)));
    --hai-ai-table-fg: var(--color-base-content, oklch(var(--bc, 0.22 0 0)));
    --hai-ai-table-primary: var(--color-primary, oklch(var(--p, 0.62 0.2 258)));
    --hai-ai-table-error: var(--color-error, oklch(var(--er, 0.64 0.2 25)));

    display: flex;
    min-height: 0;
    height: 100%;
    flex-direction: column;
    border: 1px solid color-mix(in srgb, var(--hai-ai-table-fg) 8%, transparent);
    border-radius: 1.5rem;
    background: linear-gradient(
      180deg,
      var(--hai-ai-table-bg) 0%,
      color-mix(in srgb, var(--hai-ai-table-bg) 92%, white 8%) 100%
    );
    overflow: hidden;
    box-shadow: 0 14px 40px color-mix(in srgb, var(--hai-ai-table-fg) 6%, transparent);
  }

  .hai-ai-table-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid color-mix(in srgb, var(--hai-ai-table-fg) 8%, transparent);
    background: color-mix(in srgb, var(--hai-ai-table-bg) 90%, white 10%);
  }

  .hai-ai-table-heading {
    min-width: 0;
  }

  .hai-ai-table-eyebrow {
    font-size: 0.73rem;
    font-weight: 600;
    color: color-mix(in srgb, var(--hai-ai-table-fg) 58%, transparent);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .hai-ai-table-title {
    margin: 0.25rem 0 0;
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--hai-ai-table-fg);
    line-height: 1.35;
    max-width: min(52vw, 36rem);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hai-ai-table-status {
    margin: 0.2rem 0 0;
    font-size: 0.78rem;
    color: color-mix(in srgb, var(--hai-ai-table-fg) 58%, transparent);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .hai-ai-table-toolbar {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    flex-shrink: 0;
  }

  .hai-ai-table-save-state {
    display: inline-flex;
    align-items: center;
    min-height: 2.2rem;
    padding: 0 0.82rem;
    border-radius: 9999px;
    border: 1px solid color-mix(in srgb, var(--hai-ai-table-primary) 16%, var(--hai-ai-table-bg) 84%);
    background: color-mix(in srgb, var(--hai-ai-table-primary) 10%, var(--hai-ai-table-bg) 90%);
    color: var(--hai-ai-table-primary);
    font-size: 0.78rem;
    font-weight: 600;
    white-space: nowrap;
  }

  .hai-ai-table-toolbar-btn {
    width: 2.2rem;
    height: 2.2rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.82rem;
    border: 1px solid color-mix(in srgb, var(--hai-ai-table-fg) 10%, transparent);
    background: var(--hai-ai-table-bg);
    color: color-mix(in srgb, var(--hai-ai-table-fg) 82%, transparent);
    cursor: pointer;
    transition:
      transform 0.15s ease,
      box-shadow 0.15s ease,
      border-color 0.15s ease,
      background-color 0.15s ease,
      color 0.15s ease;
  }

  .hai-ai-table-toolbar-btn :global(svg) {
    width: 1.02rem;
    height: 1.02rem;
    fill: currentColor;
  }

  .hai-ai-table-toolbar-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    color: var(--hai-ai-table-fg);
    border-color: color-mix(in srgb, var(--hai-ai-table-fg) 18%, transparent);
    background: color-mix(in srgb, var(--hai-ai-table-bg-soft) 70%, var(--hai-ai-table-bg) 30%);
    box-shadow: 0 14px 24px -20px color-mix(in srgb, var(--hai-ai-table-fg) 42%, transparent);
  }

  .hai-ai-table-toolbar-btn:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  :global(.hai-ai-download-menu__trigger.hai-ai-table-toolbar-btn) {
    width: 2.2rem;
    min-width: 2.2rem;
    height: 2.2rem;
    min-height: 0;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.82rem;
    border-color: color-mix(in srgb, var(--hai-ai-table-fg) 10%, transparent);
    background: var(--hai-ai-table-bg);
    color: color-mix(in srgb, var(--hai-ai-table-fg) 82%, transparent);
    box-shadow: none;
    box-sizing: border-box;
  }

  :global(.hai-ai-download-menu__trigger.hai-ai-table-toolbar-btn:hover) {
    transform: translateY(-1px);
    color: var(--hai-ai-table-fg);
    border-color: color-mix(in srgb, var(--hai-ai-table-fg) 18%, transparent);
    background: color-mix(in srgb, var(--hai-ai-table-bg-soft) 70%, var(--hai-ai-table-bg) 30%);
    box-shadow: 0 14px 24px -20px color-mix(in srgb, var(--hai-ai-table-fg) 42%, transparent);
  }

  :global(.hai-ai-download-menu__trigger.hai-ai-table-toolbar-btn:focus-visible) {
    outline: 2px solid color-mix(in srgb, var(--hai-ai-table-primary) 28%, transparent);
    outline-offset: 2px;
  }

  :global(.hai-ai-download-menu__trigger.hai-ai-table-toolbar-btn .hai-ai-download-menu__trigger-icon) {
    width: 1.02rem;
    height: 1.02rem;
  }

  :global(.hai-ai-table-download-menu-panel) {
    border-color: color-mix(in srgb, var(--hai-ai-table-fg) 10%, var(--hai-ai-table-bg) 90%);
    border-radius: 1.2rem;
  }

  .hai-ai-table-scroll {
    min-height: 0;
    flex: 1;
    overflow: auto;
    padding: 1rem 1.15rem 1.25rem;
    background:
      radial-gradient(
        circle at 12% 6%,
        color-mix(in srgb, var(--hai-ai-table-primary) 10%, transparent) 0%,
        transparent 46%
      ),
      var(--hai-ai-table-bg);
  }

  .hai-ai-table-grid {
    width: 100%;
    min-width: 46rem;
    border-collapse: collapse;
    border-spacing: 0;
    /* 先提供稳定回退色，再叠加 color-mix，避免低版本浏览器整条规则失效。 */
    border: 1px solid color-mix(in srgb, var(--hai-ai-table-fg) 20%, transparent);
    border: 1px solid color-mix(in srgb, var(--hai-ai-table-fg) 14%, var(--hai-ai-table-bg) 86%);
    border-radius: 1rem;
    overflow: hidden;
    background: var(--hai-ai-table-bg);
    box-shadow: 0 1px 0 color-mix(in srgb, var(--hai-ai-table-fg) 6%, transparent);
  }

  .hai-ai-table-grid thead th {
    position: sticky;
    top: 0;
    z-index: 1;
    text-align: left;
    font-size: 0.82rem;
    font-weight: 700;
    color: color-mix(in srgb, var(--hai-ai-table-fg) 84%, transparent);
    background: var(--hai-ai-table-bg-soft);
    background: color-mix(in srgb, var(--hai-ai-table-primary) 14%, var(--hai-ai-table-bg-soft) 86%);
    padding: 0.76rem 0.78rem;
    border-bottom: 1px solid color-mix(in srgb, var(--hai-ai-table-fg) 18%, transparent);
    border-bottom: 1px solid color-mix(in srgb, var(--hai-ai-table-fg) 14%, var(--hai-ai-table-bg) 86%);
  }

  .hai-ai-table-grid thead th + th {
    border-left: 1px solid color-mix(in srgb, var(--hai-ai-table-fg) 15%, transparent);
    border-left: 1px solid color-mix(in srgb, var(--hai-ai-table-fg) 11%, var(--hai-ai-table-bg) 89%);
  }

  .hai-ai-table-grid tbody td {
    border-bottom: 1px solid color-mix(in srgb, var(--hai-ai-table-fg) 14%, transparent);
    border-bottom: 1px solid color-mix(in srgb, var(--hai-ai-table-fg) 11%, var(--hai-ai-table-bg) 89%);
    border-left: 1px solid color-mix(in srgb, var(--hai-ai-table-fg) 14%, transparent);
    border-left: 1px solid color-mix(in srgb, var(--hai-ai-table-fg) 11%, var(--hai-ai-table-bg) 89%);
    padding: 0.48rem 0.56rem;
    background: var(--hai-ai-table-bg);
  }

  .hai-ai-table-grid tbody td:first-child {
    border-left: none;
  }

  .hai-ai-table-grid tbody tr:last-child td {
    border-bottom: none;
  }

  .hai-ai-table-cell-input {
    width: 100%;
    border: 1px solid transparent;
    border-radius: 0.65rem;
    padding: 0.42rem 0.5rem;
    font-size: 0.88rem;
    line-height: 1.4;
    color: color-mix(in srgb, var(--hai-ai-table-fg) 90%, transparent);
    background: transparent;
    transition:
      border-color 0.15s ease,
      background-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .hai-ai-table-cell-input:hover:enabled {
    border-color: color-mix(in srgb, var(--hai-ai-table-fg) 12%, var(--hai-ai-table-bg) 88%);
    background: color-mix(in srgb, var(--hai-ai-table-bg-soft) 70%, var(--hai-ai-table-bg) 30%);
  }

  .hai-ai-table-cell-input:focus-visible {
    outline: none;
    border-color: color-mix(in srgb, var(--hai-ai-table-primary) 58%, var(--hai-ai-table-bg) 42%);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--hai-ai-table-primary) 18%, transparent);
    background: color-mix(in srgb, var(--hai-ai-table-bg) 88%, white 12%);
  }

  .hai-ai-table-cell-input:disabled {
    cursor: default;
    color: color-mix(in srgb, var(--hai-ai-table-fg) 72%, transparent);
  }

  .hai-ai-table-cell-input--tag {
    background: color-mix(in srgb, var(--hai-ai-table-primary) 10%, var(--hai-ai-table-bg) 90%);
    color: var(--hai-ai-table-primary);
    font-weight: 600;
  }

  .hai-ai-table-cell-input--number {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .hai-ai-table-body-row {
    transition: background-color 0.15s ease, opacity 0.15s ease;
  }

  .hai-ai-table-body-row--dragging td {
    background: color-mix(in srgb, var(--hai-ai-table-bg-soft) 72%, var(--hai-ai-table-bg) 28%);
    opacity: 0.7;
  }

  .hai-ai-table-body-row--drop-before td {
    box-shadow: inset 0 3px 0 color-mix(in srgb, var(--hai-ai-table-primary) 50%, transparent);
  }

  .hai-ai-table-body-row--drop-after td {
    box-shadow: inset 0 -3px 0 color-mix(in srgb, var(--hai-ai-table-primary) 50%, transparent);
  }

  .hai-ai-table-action-head,
  .hai-ai-table-row-action {
    width: 5.2rem;
    min-width: 5.2rem;
    text-align: center;
  }

  .hai-ai-table-row-actions {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.38rem;
  }

  .hai-ai-table-row-handle,
  .hai-ai-table-row-delete {
    width: 1.95rem;
    height: 1.95rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 9999px;
    border: 1px solid color-mix(in srgb, var(--hai-ai-table-fg) 18%, var(--hai-ai-table-bg) 82%);
    color: color-mix(in srgb, var(--hai-ai-table-fg) 66%, transparent);
    background: color-mix(in srgb, var(--hai-ai-table-bg) 80%, var(--hai-ai-table-bg-soft) 20%);
    cursor: pointer;
    transition:
      opacity 0.12s ease,
      transform 0.12s ease,
      color 0.15s ease,
      border-color 0.15s ease,
      background-color 0.15s ease;
  }

  .hai-ai-table-row-handle {
    cursor: grab;
    opacity: 0.82;
  }

  .hai-ai-table-row-handle:active {
    cursor: grabbing;
  }

  .hai-ai-table-row-handle:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .hai-ai-table-row-handle :global(svg),
  .hai-ai-table-row-delete :global(svg) {
    width: 0.86rem;
    height: 0.86rem;
    fill: currentColor;
  }

  .hai-ai-table-body-row:hover .hai-ai-table-row-handle:not(:disabled) {
    opacity: 1;
  }

  .hai-ai-table-body-row:hover .hai-ai-table-row-delete {
    opacity: 1;
  }

  .hai-ai-table-row-actions:focus-within .hai-ai-table-row-delete {
    opacity: 1;
  }

  .hai-ai-table-row-handle:hover:not(:disabled),
  .hai-ai-table-row-delete:hover {
    transform: translateY(-1px);
  }

  .hai-ai-table-row-handle:focus-visible,
  .hai-ai-table-row-delete:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--hai-ai-table-primary) 26%, transparent);
    outline-offset: 2px;
  }

  .hai-ai-table-row-handle:hover:not(:disabled) {
    color: var(--hai-ai-table-fg);
    border-color: color-mix(in srgb, var(--hai-ai-table-primary) 24%, var(--hai-ai-table-bg) 76%);
    background: color-mix(in srgb, var(--hai-ai-table-primary) 8%, var(--hai-ai-table-bg) 92%);
  }

  .hai-ai-table-row-delete {
    opacity: 0.38;
  }

  .hai-ai-table-row-delete:hover {
    color: var(--hai-ai-table-error);
    border-color: color-mix(in srgb, var(--hai-ai-table-error) 42%, var(--hai-ai-table-bg) 58%);
    background: color-mix(in srgb, var(--hai-ai-table-error) 9%, var(--hai-ai-table-bg) 91%);
  }

  .hai-ai-table-empty {
    text-align: center;
    color: color-mix(in srgb, var(--hai-ai-table-fg) 52%, transparent);
    font-size: 0.84rem;
    padding: 1.15rem 0.75rem;
    background: color-mix(in srgb, var(--hai-ai-table-bg-soft) 52%, var(--hai-ai-table-bg) 48%);
  }

  .hai-ai-table-add-row td {
    padding: 0.58rem 0.62rem;
    background: color-mix(in srgb, var(--hai-ai-table-bg-soft) 45%, var(--hai-ai-table-bg) 55%);
  }

  .hai-ai-table-add-btn {
    width: 100%;
    height: 2rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
    border: 1px dashed color-mix(in srgb, var(--hai-ai-table-primary) 35%, var(--hai-ai-table-bg) 65%);
    border-radius: 0.66rem;
    color: var(--hai-ai-table-primary);
    font-size: 0.82rem;
    font-weight: 600;
    background: color-mix(in srgb, var(--hai-ai-table-primary) 7%, var(--hai-ai-table-bg) 93%);
    cursor: pointer;
    transition:
      border-color 0.15s ease,
      background-color 0.15s ease,
      transform 0.15s ease;
  }

  .hai-ai-table-add-btn :global(svg) {
    width: 0.92rem;
    height: 0.92rem;
    fill: currentColor;
  }

  .hai-ai-table-add-btn:hover {
    transform: translateY(-1px);
    border-color: color-mix(in srgb, var(--hai-ai-table-primary) 52%, var(--hai-ai-table-bg) 48%);
    background: color-mix(in srgb, var(--hai-ai-table-primary) 11%, var(--hai-ai-table-bg) 89%);
  }

  @media (max-width: 768px) {
    .hai-ai-table-header {
      flex-wrap: wrap;
      align-items: flex-start;
    }

    .hai-ai-table-title {
      max-width: min(76vw, 22rem);
    }

    .hai-ai-table-grid {
      min-width: 36rem;
    }
  }
</style>
