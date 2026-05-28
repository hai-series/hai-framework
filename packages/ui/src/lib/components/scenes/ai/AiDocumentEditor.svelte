<!--
  =============================================================================
  @h-ai/ui - AiDocumentEditor 组件
  =============================================================================
  通用 Markdown 渲染器，支持两种模式：
  - document：带目录、工具栏、代码运行预览的文档面板
  - code: 仅渲染代码块，适用于 AI 代码产物的展示和交互。

  适用于 AI 输出显示、文档预览、代码说明面板等场景。
  使用 Svelte 5 Runes ($props, $state, $derived, $effect)
  =============================================================================
-->
<script lang='ts'>
  import type {
    AiDocumentEditorProps,
    MarkdownBlockFormatKind,
    MarkdownBlockStyleKind,
    MarkdownCodeBlockItem,
    MarkdownCodeRunRequest,
    MarkdownCodeRunResult,
    MarkdownColorFormatRequest,
    MarkdownInlineFormatKind,
    MarkdownRewriteAction,
    MarkdownSelectionSnapshot,
    MarkdownTextAlignKind,
  } from './document-types.js'
  import { tick } from 'svelte'
  import { uiM } from '../../../messages.js'
  import { cn } from '../../../utils.js'
  import AiDocumentDownloadMenu from './AiDocumentDownloadMenu.svelte'
  import { resolveDocumentMarkdownContent } from './document-download.js'
  import { renderMarkdownDocument } from './document-parse.js'
  import { parseMarkdown } from './markdown-parse.js'

  interface SelectionToolbarPosition {
    /** 选区工具条相对滚动容器的 top 坐标。 */
    top: number
    /** 选区工具条左侧边缘相对滚动容器的 left 坐标。 */
    left: number
    /** 选区工具条应该出现在选区上方还是下方，避免遮挡正文。 */
    placement: 'top' | 'bottom'
    /** 工具条在主内容中的水平贴边方式，避免浮层越过正文区域。 */
    alignment: 'left' | 'center' | 'right'
  }

  interface CodePreviewState {
    /** 当前代码块预览所处的生命周期阶段。 */
    status: 'running' | 'ready' | 'error'
    /** 运行成功后用于渲染预览区的结构化结果。 */
    result?: MarkdownCodeRunResult
    /** 运行失败时展示在预览区的错误摘要。 */
    error?: string
  }

  interface SelectionFormatState {
    /** 当前选区所在段落样式，用于标题/正文下拉默认值。 */
    blockFormat: MarkdownBlockStyleKind
    /** 当前选区所在段落的对齐方式。 */
    alignment: MarkdownTextAlignKind
    /** 当前选区是否命中加粗样式。 */
    bold: boolean
    /** 当前选区是否命中删除线样式。 */
    strike: boolean
    /** 当前选区是否命中斜体样式。 */
    italic: boolean
    /** 当前选区是否命中下划线样式。 */
    underline: boolean
    /** 当前选区是否命中 `<mark>` 或自定义底色高亮。 */
    highlight: boolean
    /** 当前选区是否落在行内代码内。 */
    code: boolean
    /** 当前选区命中的链接地址；为空表示无链接。 */
    linkHref: string
    /** 当前选区前景色；为空表示使用默认文字颜色。 */
    textColor: string | null
    /** 当前选区背景色；为空表示使用默认背景。 */
    backgroundColor: string | null
  }

  interface PreviewSelectionState {
    /** 浏览器当前仍然有效的正文选区。 */
    selection: Selection
    /** 当前选区对应的 DOM Range，用于计算浮层定位。 */
    range: Range
    /** 归一化后的选中文本。 */
    text: string
  }

  interface ColorSwatchOption {
    /** 颜色值；为空表示恢复默认或清除当前维度。 */
    value: string | null
    /** 展示标题，用于 hover / a11y。 */
    titleKey: 'markdown_background_none'
  }

  interface HoveredLinkState {
    /** 当前悬停的链接元素。 */
    element: HTMLAnchorElement
    /** 浏览器可直接打开的绝对链接地址。 */
    href: string
    /** 编辑时优先回填原始 href 属性，避免相对地址被强制绝对化。 */
    rawHref: string
    /** 悬停浮层相对滚动容器的 top 坐标。 */
    top: number
    /** 悬停浮层左侧边缘相对滚动容器的 left 坐标。 */
    left: number
    /** 浮层出现在链接上方还是下方。 */
    placement: 'top' | 'bottom'
  }

  type SelectionMenuKind = 'rewrite' | 'block' | 'align' | 'link' | 'color'

  const BLOCK_FORMAT_OPTIONS: Array<{
    value: MarkdownBlockStyleKind
    labelKey:
      | 'markdown_format_paragraph'
      | 'markdown_format_heading_1'
      | 'markdown_format_heading_2'
      | 'markdown_format_heading_3'
      | 'markdown_format_heading_4'
      | 'markdown_format_ordered_list'
      | 'markdown_format_bullet_list'
    shortLabel: string
  }> = [
    {
      value: 'paragraph',
      labelKey: 'markdown_format_paragraph',
      shortLabel: 'T',
    },
    {
      value: 'heading1',
      labelKey: 'markdown_format_heading_1',
      shortLabel: 'H1',
    },
    {
      value: 'heading2',
      labelKey: 'markdown_format_heading_2',
      shortLabel: 'H2',
    },
    {
      value: 'heading3',
      labelKey: 'markdown_format_heading_3',
      shortLabel: 'H3',
    },
    {
      value: 'orderedList',
      labelKey: 'markdown_format_ordered_list',
      shortLabel: '1.',
    },
    {
      value: 'bulletList',
      labelKey: 'markdown_format_bullet_list',
      shortLabel: '•',
    },
    {
      value: 'heading4',
      labelKey: 'markdown_format_heading_4',
      shortLabel: 'H4',
    },
  ]

  const ALIGN_OPTIONS: Array<{
    value: MarkdownTextAlignKind
    labelKey:
      | 'markdown_align_left'
      | 'markdown_align_center'
      | 'markdown_align_right'
      | 'markdown_align_justify'
  }> = [
    { value: 'left', labelKey: 'markdown_align_left' },
    { value: 'center', labelKey: 'markdown_align_center' },
    { value: 'right', labelKey: 'markdown_align_right' },
    { value: 'justify', labelKey: 'markdown_align_justify' },
  ]

  const TEXT_COLOR_PRESETS = [
    '#0f172a',
    '#475569',
    '#b91c1c',
    '#ea580c',
    '#ca8a04',
    '#15803d',
    '#2563eb',
    '#7c3aed',
  ] as const

  const BACKGROUND_COLOR_PRESETS = [
    '#fee2e2',
    '#ffedd5',
    '#fef3c7',
    '#dcfce7',
    '#dbeafe',
    '#ede9fe',
    '#f3f4f6',
    '#e2e8f0',
  ] as const
  const BACKGROUND_COLOR_OPTIONS: readonly (typeof BACKGROUND_COLOR_PRESETS[number] | ColorSwatchOption)[] = [
    { value: null, titleKey: 'markdown_background_none' },
    ...BACKGROUND_COLOR_PRESETS,
  ] as const
  const FALLBACK_BLOCK_FORMAT_OPTION = BLOCK_FORMAT_OPTIONS.find(
    option => option.value === 'paragraph',
  ) ?? BLOCK_FORMAT_OPTIONS[0]

  const DEFAULT_SELECTION_FORMAT_STATE: SelectionFormatState = {
    blockFormat: 'paragraph',
    alignment: 'left',
    bold: false,
    strike: false,
    italic: false,
    underline: false,
    highlight: false,
    code: false,
    linkHref: '',
    textColor: null,
    backgroundColor: null,
  }

  // 复制前后的图标以内联 SVG 缓存，避免每次点击都重新拼接按钮内容。
  const COPY_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`
  const CHECK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`

  let {
    // 暴露给外层的滚动容器引用，用于同步滚动或定位选区工具条。
    editorScrollHost = $bindable<HTMLDivElement | null>(null),
    // 暴露给外层的正文容器引用，contenteditable 时用于读取 DOM。
    previewHost = $bindable<HTMLElement | null>(null),
    // 文档原始 Markdown 内容。
    content = '',
    // 文档标题展示文案。
    title = '',
    // 内容来源类型，决定 document/code 渲染分支。
    sourceKind = 'markdown',
    // sourceKind=code 时的默认语言提示。
    codeLanguage,
    // 外层自定义类名。
    class: className = '',
    // 是否显示代码块复制按钮。
    showCopyButton = true,
    // 是否显示代码块运行按钮与预览占位。
    showRunButton = false,
    // 是否在代码块头部显示“代码/预览”切换。
    showCodePreviewToggle = false,
    // 代码预览切换模式下展示在语言标签旁的提示文案。
    codePreviewHint = '',
    // 是否启用语法高亮。
    enableHighlight = true,
    // 是否把换行渲染为 <br>。
    breaks = true,
    // 是否显示左侧目录。
    showOutline = true,
    // 是否显示目录项的序号前缀。
    showOutlineNumbering = false,
    // 是否显示顶部工具栏。
    showToolbar = true,
    // 目录面板初始是否折叠。
    initialOutlineCollapsed = false,
    // 是否处于改写中状态。
    rewritePending = false,
    // 改写动作列表。
    rewriteActions = [],
    // 是否启用正文编辑能力。
    editable = false,
    // 顶部下载菜单动作列表。
    downloadActions = [],
    // “历史版本”按钮文案。
    historyActionLabel = uiM('markdown_history'),
    // 关闭回调。
    onclose,
    // 返回按钮是否禁用。
    closeDisabled = false,
    // 撤销回调。
    onundo,
    // 撤销按钮是否禁用。
    undoDisabled = false,
    // 重做回调。
    onredo,
    // 重做按钮是否禁用。
    redoDisabled = false,
    // 代码运行回调。
    oncoderun,
    // 选区改写回调。
    onrewrite,
    // 文档滚动回调。
    ondocumentscroll,
    // 选区 mouseup 回调。
    onpreviewmouseup,
    // 编辑输入回调。
    onpreviewinput,
    // 编辑失焦回调。
    onpreviewblur,
    // 下载动作回调。
    ondownload,
    // 历史版本入口回调。
    onhistory,
    // 全文复制回调。
    oncopydocument,
    // 块级格式动作回调。
    onapplyblockformat,
    // 细粒度块样式动作回调。
    onapplyblockstyle,
    // 行内格式动作回调。
    onapplyinlineformat,
    // 对齐动作回调。
    onapplyalignment,
    // 链接设置动作回调。
    onapplylink,
    // 颜色设置动作回调。
    onapplycolor,
    // 选区复制回调。
    oncopyselection,
    // 选区注释回调。
    onannotation,
  }: AiDocumentEditorProps = $props()

  // outlineCollapsedInitialized 用来把 `initialOutlineCollapsed` 只消费一次，避免用户手动展开后又被 props 回写覆盖。
  let outlineCollapsedInitialized = $state(false)
  // 当前目录是否折叠。
  let outlineCollapsed = $state(false)
  // 当前滚动视口对应的高亮标题 id。
  let activeHeadingId = $state('')
  // 当前选中的纯文本，会原样传给 AI 改写动作。
  let selectedText = $state('')
  // 选区工具条显示开关。
  let selectionToolbarVisible = $state(false)
  // 选区工具条当前展开的子菜单，统一管理避免多个面板互相覆盖。
  let activeSelectionMenu = $state<SelectionMenuKind | null>(null)
  // 文档头部标题只有在正文首个标题滚出可视区后才显示，避免双标题并排出现。
  let showPinnedTitle = $state(false)
  // 选区工具条在滚动容器中的定位坐标。
  let toolbarPosition = $state<SelectionToolbarPosition>({
    top: 0,
    left: 0,
    placement: 'top',
    alignment: 'center',
  })
  // 窄容器下目录会改成悬浮覆盖模式，保存 DOM 引用后才能在定位工具条时主动避让。
  let outlinePanelEl = $state<HTMLElement | null>(null)
  // chrome 节点同时包住主工具条和下拉面板，方便判断焦点是否仍留在浮层内部。
  let selectionChromeEl = $state<HTMLDivElement | null>(null)
  // 选区工具条自身 DOM，用于根据真实尺寸修正贴边位置。
  let selectionToolbarEl = $state<HTMLDivElement | null>(null)
  // 当前展开菜单对应的触发按钮，用来把面板锚定到具体按钮下方/上方。
  let activeSelectionMenuTrigger = $state<HTMLElement | null>(null)
  // 菜单面板相对工具条的水平锚点。
  let selectionMenuLeft = $state(0)
  // 菜单面板在锚点处的对齐方式，避免宽面板越过正文边界。
  let selectionMenuAlignment = $state<'left' | 'center' | 'right'>('center')
  // documentCopied 只负责顶部复制按钮的瞬时反馈，不和正文内容状态混用。
  let documentCopied = $state(false)
  // copyFeedbackTimer 用来保证连续点击复制时，成功态能按最后一次操作重新计时。
  let copyFeedbackTimer: number | undefined = $state()
  // 每个代码块的运行状态和预览结果，key 为 codeBlockId。
  let codePreviews = $state<Record<string, CodePreviewState>>({})
  // selectionFormatState 跟随真实 DOM 选区，负责驱动按钮按下态与下拉默认值。
  let selectionFormatState = $state<SelectionFormatState>({
    ...DEFAULT_SELECTION_FORMAT_STATE,
  })
  // linkDraft 只在链接弹层里暂存输入值，避免每次打开都丢掉正在编辑的链接。
  let linkDraft = $state('')
  // 链接输入框允许接管焦点，但格式动作仍需要恢复到正文的最后一个有效选区。
  let linkInputEl = $state<HTMLInputElement | null>(null)
  // 链接按钮 DOM 用来在“悬停编辑链接”场景下复用现有链接弹层定位。
  let selectionLinkButtonEl = $state<HTMLButtonElement | null>(null)
  // 原始 DOM Range 在结构没变时恢复最快，也能保留浏览器原生的精确边界。
  let savedSelectionRange = $state<Range | null>(null)
  // 纯文本快照用于 DOM 被局部重建后的兜底恢复，避免只靠 Range 引用失效。
  let savedSelectionSnapshot = $state<MarkdownSelectionSnapshot | null>(null)
  // 真实尺寸修正只需要排队一帧，避免反复触发 handleSelectionChange 形成抖动。
  let selectionToolbarMeasurePending = false
  // 选区刷新统一合并到同一帧，避免 selectionchange / mouseup / blur 连续触发时抖动。
  let selectionRefreshFrame: number | undefined
  // 同一帧内任一来源要求重新量尺时，都要把这次刷新升级成 remeasure 版本。
  let selectionRefreshNeedsRemeasure = false
  // 浏览器在滚动到底部或切换焦点时会短暂给出空选区，这里延迟一拍再关闭工具条。
  let selectionToolbarCloseTimer: number | undefined
  // 悬停到已配置链接时显示快捷浮层，便于直接打开或编辑。
  let hoveredLinkState = $state<HoveredLinkState | null>(null)
  // 悬停浮层需要拿到真实尺寸后再二次校正位置。
  let hoveredLinkPopoverEl = $state<HTMLDivElement | null>(null)
  // 鼠标从正文移动到悬停浮层时给一小段缓冲，避免浮层闪烁。
  let hoveredLinkHideTimer: number | undefined

  // code 类型产物通常只有裸代码文本，这里统一包成 fenced block 进入同一条渲染链路。
  const documentContent = $derived(
    resolveDocumentMarkdownContent(content, sourceKind, codeLanguage),
  )
  // 渲染结果同时提供 HTML、目录和代码块元数据，供顶部目录与代码预览共用。
  const codePreviewToggleEnabled = $derived(
    showCodePreviewToggle && sourceKind === 'code',
  )
  // hint 文案统一做 trim，避免只传空格时仍把占位区域撑开。
  const normalizedCodePreviewHint = $derived(codePreviewHint.trim())
  const renderResult = $derived(
    renderMarkdownDocument(documentContent, {
      enableHighlight,
      showCopyButton,
      showRunButton,
      showCodePreviewToggle: codePreviewToggleEnabled,
      codeViewCodeLabel: uiM('markdown_format_code'),
      codeViewPreviewLabel: uiM('file_list_preview'),
      codePreviewHint: normalizedCodePreviewHint,
      breaks,
    }),
  )
  // html 是最终注入正文的内容。
  const html = $derived(renderResult.html)
  // outline 是左侧目录的原始数据源。
  const outline = $derived(renderResult.outline)
  // outlineHasContent 用来区分“目录被收起”和“正文确实没有标题”。
  const outlineHasContent = $derived(outline.length > 0)
  // 未显式传入动作时，按内置动作列表补齐 AI 改写菜单。
  const resolvedRewriteActions = $derived(
    resolveRewriteActions(rewriteActions, onrewrite),
  )
  // 只有一个改写动作时直接渲染成按钮，多动作才保留菜单，减少一次点击。
  const directRewriteAction = $derived(
    resolvedRewriteActions.length === 1 ? resolvedRewriteActions[0] : null,
  )
  // 新版工具条支持 paragraph / heading1-4，优先走细粒度回调，避免把旧接口误当成新接口调用。
  const richBlockFormattingEnabled = $derived(Boolean(onapplyblockstyle))
  // 旧版 heading / bullet 回调仍然保留，用于兼容外部还没迁移的调用方。
  const legacyBlockFormattingEnabled = $derived(
    Boolean(onapplyblockformat) && !onapplyblockstyle,
  )
  // 这里统一判断是否存在任意块级格式能力，方便控制分隔线和浮层显隐。
  const anyBlockFormattingEnabled = $derived(
    richBlockFormattingEnabled || legacyBlockFormattingEnabled,
  )
  // selectionToolsEnabled 统一判断选区工具条是否值得出现，避免正文只读展示时还露出空浮层。
  const selectionToolsEnabled = $derived(
    [
      onrewrite,
      anyBlockFormattingEnabled,
      onapplyinlineformat,
      onapplyalignment,
      onapplylink,
      onapplycolor,
      oncopyselection,
      onannotation,
    ].some(Boolean),
  )
  // 当前段落样式的展示文案，直接来自 `selectionFormatState`，避免按钮标题和下拉选中值不同步。
  const activeBlockFormatOption = $derived(
    BLOCK_FORMAT_OPTIONS.find(
      option => option.value === selectionFormatState.blockFormat,
    ) ?? FALLBACK_BLOCK_FORMAT_OPTION,
  )
  // readerDocumentClass 只负责正文文章区域，不和外层容器类名混用。
  const readerDocumentClass = $derived(
    cn(
      'hai-markdown',
      'hai-markdown-document',
      sourceKind === 'code' ? 'hai-markdown-code-only' : '',
      editable ? 'hai-markdown-editable' : '',
    ),
  )

  $effect(() => {
    void html
    if (typeof window === 'undefined' || !previewHost) {
      return
    }

    requestAnimationFrame(() => {
      syncCodePreviewHosts()
      syncActiveHeadingFromScroll()
      syncPinnedTitleVisibility()
    })
  })

  $effect(() => {
    void codePreviews
    if (typeof window === 'undefined' || !previewHost) {
      return
    }

    requestAnimationFrame(() => {
      syncCodePreviewHosts()
    })
  })

  $effect(() => {
    void outline
    if (!outlineHasContent) {
      activeHeadingId = ''
      return
    }

    if (
      !activeHeadingId
      || !outline.some(item => item.id === activeHeadingId)
    ) {
      activeHeadingId = outline[0]?.id ?? ''
    }
  })

  $effect(() => {
    void documentContent
    codePreviews = {}
    hoveredLinkState = null
    queueSelectionRefresh(true)
  })

  $effect(() => {
    if (outlineCollapsedInitialized) {
      return
    }

    outlineCollapsed = initialOutlineCollapsed
    outlineCollapsedInitialized = true
  })

  $effect(() => {
    return () => {
      if (copyFeedbackTimer) {
        window.clearTimeout(copyFeedbackTimer)
      }

      if (selectionRefreshFrame) {
        window.cancelAnimationFrame(selectionRefreshFrame)
      }

      if (selectionToolbarCloseTimer) {
        window.clearTimeout(selectionToolbarCloseTimer)
      }

      if (hoveredLinkHideTimer) {
        window.clearTimeout(hoveredLinkHideTimer)
      }
    }
  })

  $effect(() => {
    if (typeof document === 'undefined' || !previewHost || !selectionToolsEnabled) {
      return
    }

    const handleDocumentSelectionChange = (): void => {
      queueSelectionRefresh()
    }

    document.addEventListener('selectionchange', handleDocumentSelectionChange)

    return () => {
      document.removeEventListener(
        'selectionchange',
        handleDocumentSelectionChange,
      )
    }
  })

  $effect(() => {
    if (
      typeof document === 'undefined'
      || !selectionToolbarVisible
    ) {
      return
    }

    const handleDocumentPointerDown = (event: MouseEvent): void => {
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }

      if (selectionChromeEl?.contains(target)) {
        return
      }

      closeSelectionToolbar()
    }

    document.addEventListener('mousedown', handleDocumentPointerDown, true)

    return () => {
      document.removeEventListener('mousedown', handleDocumentPointerDown, true)
    }
  })

  $effect(() => {
    if (typeof window === 'undefined' || activeSelectionMenu !== 'link' || !linkInputEl) {
      return
    }

    const nextLinkInput = linkInputEl
    const focusFrame = window.requestAnimationFrame(() => {
      nextLinkInput.focus()
      nextLinkInput.select()
    })

    return () => {
      window.cancelAnimationFrame(focusFrame)
    }
  })

  $effect(() => {
    if (typeof window === 'undefined' || !hoveredLinkState || !hoveredLinkPopoverEl) {
      return
    }

    const measureFrame = window.requestAnimationFrame(() => {
      syncHoveredLinkPosition()
    })

    return () => {
      window.cancelAnimationFrame(measureFrame)
    }
  })

  function resolveRewriteActions(
    actions: MarkdownRewriteAction[],
    handler?: AiDocumentEditorProps['onrewrite'],
  ): MarkdownRewriteAction[] {
    if (actions.length > 0) {
      return actions
    }

    if (!handler) {
      return []
    }

    return [
      { id: 'polish', label: uiM('markdown_rewrite_polish') },
      { id: 'expand', label: uiM('markdown_rewrite_expand') },
      { id: 'shorten', label: uiM('markdown_rewrite_shorten') },
      { id: 'explain', label: uiM('markdown_rewrite_explain') },
    ]
  }

  const HTML_DOCUMENT_PATTERN = /<!doctype html>|<html[\s>]|<body[\s>]|<div[\s>]|<main[\s>]/i

  async function copyRawContent(): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(content)
      return true
    }
    catch {
      // clipboard API 可能被安全策略禁用；保持静默避免打断阅读。
      return false
    }
  }

  function triggerDocumentCopiedFeedback(): void {
    documentCopied = true
    if (copyFeedbackTimer) {
      window.clearTimeout(copyFeedbackTimer)
    }

    copyFeedbackTimer = window.setTimeout(() => {
      documentCopied = false
      copyFeedbackTimer = undefined
    }, 1800)
  }

  async function handleCopyDocument(): Promise<void> {
    if (oncopydocument) {
      await oncopydocument()
      triggerDocumentCopiedFeedback()
      return
    }

    if (await copyRawContent()) {
      triggerDocumentCopiedFeedback()
    }
  }

  function updateCopyButtonState(button: HTMLButtonElement): void {
    button.classList.add('hai-md-copied')
    button.innerHTML = CHECK_ICON

    window.setTimeout(() => {
      button.classList.remove('hai-md-copied')
      button.innerHTML = COPY_ICON
    }, 2000)
  }

  async function copyCodeFromButton(button: HTMLButtonElement): Promise<void> {
    const codeBlock = button.closest('.hai-md-code-block')
    const codeEl = codeBlock?.querySelector('code')
    if (!codeEl) {
      return
    }

    try {
      await navigator.clipboard.writeText(codeEl.textContent ?? '')
      updateCopyButtonState(button)
    }
    catch {
    // clipboard API 可能被安全策略禁用；不抛错以免阻断其他交互。
    }
  }

  function lookupCodeBlock(blockId: string): MarkdownCodeBlockItem | undefined {
    return renderResult.codeBlocks.find(item => item.id === blockId)
  }

  function looksLikeHtml(code: string): boolean {
    return HTML_DOCUMENT_PATTERN.test(code)
  }

  function buildJavaScriptPreview(code: string): string {
    const safeCode = code.replace(/<\/script/gi, '<\\/script')

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body {
        margin: 0;
        padding: 16px;
        font: 14px/1.6 system-ui, sans-serif;
        color: #1f2937;
        background: #f8fafc;
      }

      #app {
        min-height: 48px;
      }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script type="module">
${safeCode}
    <\/script>
  </body>
</html>`
  }

  function buildCssPreview(code: string): string {
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>${code}</style>
    <style>
      body {
        margin: 0;
        padding: 20px;
        font: 14px/1.6 system-ui, sans-serif;
        background: #f8fafc;
      }

      .preview-card {
        border-radius: 16px;
        padding: 24px;
        border: 1px dashed #cbd5e1;
        background: white;
      }
    </style>
  </head>
  <body>
    <div class="preview-card">
      <h3>CSS Preview</h3>
      <p>This surface is provided so the stylesheet can render immediately.</p>
      <button type="button">Action</button>
    </div>
  </body>
</html>`
  }

  /**
   * 没有外部运行器时，组件只为可直接在浏览器里安全预览的语言提供兜底能力。
   * 其余语言返回 undefined，让上层明确知道需要后端或沙箱参与执行。
   */
  function createBuiltInCodePreview(
    request: MarkdownCodeRunRequest,
  ): MarkdownCodeRunResult | undefined {
    const language = request.language?.trim().toLocaleLowerCase()

    if (
      language === 'html'
      || language === 'htm'
      || language === 'xml'
      || language === 'svg'
      || (!language && looksLikeHtml(request.code))
    ) {
      return {
        kind: 'html',
        title: uiM('markdown_run_preview'),
        content: request.code,
      }
    }

    if (language === 'javascript' || language === 'js' || language === 'mjs') {
      return {
        kind: 'html',
        title: uiM('markdown_run_preview'),
        content: buildJavaScriptPreview(request.code),
      }
    }

    if (language === 'css') {
      return {
        kind: 'html',
        title: uiM('markdown_run_preview'),
        content: buildCssPreview(request.code),
      }
    }

    if (language === 'markdown' || language === 'md') {
      return {
        kind: 'markdown',
        title: uiM('markdown_run_preview'),
        content: request.code,
      }
    }

    return undefined
  }

  function formatPreviewLanguageLabel(language: string | undefined): string | null {
    const normalized = language?.trim().toLocaleLowerCase()
    if (!normalized) {
      return null
    }

    if (
      normalized === 'javascript'
      || normalized === 'js'
      || normalized === 'mjs'
    ) {
      return 'JavaScript'
    }

    if (normalized === 'markdown' || normalized === 'md') {
      return 'Markdown'
    }

    return normalized.toUpperCase()
  }

  function resolvePreviewUnavailableMessage(language: string | undefined): string {
    const languageLabel = formatPreviewLanguageLabel(language)
    if (!languageLabel) {
      return uiM('markdown_run_unavailable')
    }

    return uiM('markdown_run_unavailable_language', {
      language: languageLabel,
    })
  }

  async function runCodeBlock(blockId: string): Promise<void> {
    const codeBlock = lookupCodeBlock(blockId)
    if (!codeBlock) {
      return
    }

    codePreviews = {
      ...codePreviews,
      [blockId]: {
        status: 'running',
      },
    }

    const request: MarkdownCodeRunRequest = {
      blockId,
      code: codeBlock.code,
      language: codeBlock.language,
      title: title || undefined,
      sourceKind,
    }

    try {
      const preview = await (oncoderun?.(request)
        ?? createBuiltInCodePreview(request))

      if (!preview) {
        codePreviews = {
          ...codePreviews,
          [blockId]: {
            status: 'error',
            error: resolvePreviewUnavailableMessage(request.language),
          },
        }
        return
      }

      codePreviews = {
        ...codePreviews,
        [blockId]: {
          status: 'ready',
          result: preview,
        },
      }
    }
    catch (error) {
      codePreviews = {
        ...codePreviews,
        [blockId]: {
          status: 'error',
          error:
            error instanceof Error ? error.message : uiM('markdown_run_failed'),
        },
      }
    }
  }

  function setCodeBlockView(
    codeBlock: HTMLElement,
    view: 'code' | 'preview',
  ): void {
    codeBlock.dataset.codeView = view
    const toggleButtons = codeBlock.querySelectorAll<HTMLButtonElement>(
      '[data-code-view-toggle]',
    )
    for (const button of toggleButtons) {
      const isActive = button.dataset.codeView === view
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false')
    }
  }

  /**
   * 统一承接正文里通过 `{@html}` 注入的交互节点点击。
   * 这些按钮和链接不受 Svelte 逐个绑定管理，因此在容器级别做代理更稳妥。
   */
  async function handleClick(event: MouseEvent): Promise<void> {
    const target = event.target as HTMLElement
    const copyButton = target.closest(
      '[data-copy-code]',
    ) as HTMLButtonElement | null
    if (copyButton) {
      await copyCodeFromButton(copyButton)
      return
    }

    const viewButton = target.closest(
      '[data-code-view-toggle]',
    ) as HTMLButtonElement | null
    const viewCodeBlock = viewButton?.closest<HTMLElement>('.hai-md-code-block')
    const viewCodeBlockId = viewButton?.dataset.codeBlockId
    const nextView = viewButton?.dataset.codeView === 'preview'
      ? 'preview'
      : 'code'
    if (viewButton && viewCodeBlock) {
      setCodeBlockView(viewCodeBlock, nextView)
      if (
        nextView === 'preview'
        && viewCodeBlockId
        && codePreviews[viewCodeBlockId]?.status !== 'ready'
      ) {
        await runCodeBlock(viewCodeBlockId)
      }
      return
    }

    const runButton = target.closest(
      '[data-run-code]',
    ) as HTMLButtonElement | null
    const codeBlockId = runButton?.dataset.codeBlockId
    if (runButton && codeBlockId) {
      await runCodeBlock(codeBlockId)
      return
    }

    const link = target.closest('a[href]') as HTMLAnchorElement | null
    if (editable && link && previewHost?.contains(link)) {
      const href = link.href.trim()
      if (!href) {
        return
      }

      event.preventDefault()
      window.open(
        href,
        link.target || '_blank',
        'noopener,noreferrer',
      )
    }
  }

  /**
   * 代码预览宿主位于 `{@html}` 注入的 DOM 内部，无法直接用 Svelte 子组件管理。
   * 这里统一在 effect 中把运行结果写回这些占位节点，兼顾运行中、成功和失败三种状态。
   */
  function syncCodePreviewHosts(): void {
    if (!previewHost) {
      return
    }

    const hosts = previewHost.querySelectorAll<HTMLElement>(
      '[data-code-preview-host]',
    )
    for (const host of hosts) {
      const blockId = host.dataset.codePreviewHost
      if (!blockId) {
        continue
      }

      renderCodePreviewHost(host, codePreviews[blockId])
    }
  }

  function renderCodePreviewHost(
    host: HTMLElement,
    preview: CodePreviewState | undefined,
  ): void {
    if (!preview) {
      host.innerHTML = ''
      return
    }

    if (preview.status === 'running') {
      host.innerHTML = `<div class="hai-md-preview-card"><div class="hai-md-preview-empty"><div class="hai-md-preview-empty-title">${escapePreviewText(uiM('markdown_running'))}</div><div class="hai-md-preview-loading"></div></div></div>`
      return
    }

    if (preview.status === 'error') {
      host.innerHTML = `<div class="hai-md-preview-card hai-md-preview-error"><div class="hai-md-preview-empty"><div class="hai-md-preview-empty-title">${escapePreviewText(uiM('markdown_run_failed'))}</div><p class="hai-md-preview-empty-text">${escapePreviewText(preview.error ?? uiM('markdown_run_failed'))}</p></div></div>`
      return
    }

    const result = preview.result
    if (!result) {
      host.innerHTML = ''
      return
    }

    const previewTitle = escapePreviewText(
      result.title ?? uiM('markdown_run_preview'),
    )
    const previewDesc = result.description
      ? `<p class="hai-md-preview-desc">${escapePreviewText(result.description)}</p>`
      : ''

    if (result.kind === 'html') {
      host.innerHTML = `<div class="hai-md-preview-card"><div class="hai-md-preview-head">${previewTitle}</div>${previewDesc}<iframe class="hai-md-preview-frame" sandbox="allow-scripts" srcdoc="${escapePreviewAttribute(result.content)}" title="${previewTitle}"></iframe></div>`
      return
    }

    if (result.kind === 'markdown') {
      const markdownHtml = parseMarkdown(result.content, {
        enableHighlight,
        showCopyButton: false,
        breaks,
      })

      host.innerHTML = `<div class="hai-md-preview-card"><div class="hai-md-preview-head">${previewTitle}</div>${previewDesc}<div class="hai-md-preview-rendered">${markdownHtml}</div></div>`
      return
    }

    host.innerHTML = `<div class="hai-md-preview-card"><div class="hai-md-preview-head">${previewTitle}</div>${previewDesc}<pre>${escapePreviewText(result.content)}</pre></div>`
  }

  function escapePreviewText(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  function escapePreviewAttribute(value: string): string {
    return escapePreviewText(value).replace(/\n/g, '&#10;')
  }

  function getSelectionAnchorElement(selection: Selection): HTMLElement | null {
    const anchorNode = selection.anchorNode
    if (!anchorNode) {
      return null
    }

    return anchorNode instanceof HTMLElement
      ? anchorNode
      : anchorNode.parentElement
  }

  function getClosestBlockElement(element: HTMLElement | null): HTMLElement | null {
    if (!element || !previewHost) {
      return null
    }

    const block = element.closest('p, h1, h2, h3, h4, h5, h6, li')
    return block instanceof HTMLElement && previewHost.contains(block)
      ? block
      : null
  }

  function readComputedInlineState(element: HTMLElement | null): Pick<
    SelectionFormatState,
    'bold' | 'italic' | 'strike' | 'underline'
  > {
    if (!element || typeof window === 'undefined') {
      return {
        bold: false,
        italic: false,
        strike: false,
        underline: false,
      }
    }

    const style = window.getComputedStyle(element)
    const fontWeight = Number.parseInt(style.fontWeight, 10)
    const decoration = `${style.textDecorationLine} ${style.textDecoration}`
      .toLowerCase()

    return {
      bold: Number.isNaN(fontWeight)
        ? ['bold', 'bolder'].includes(style.fontWeight.toLowerCase())
        : fontWeight >= 600,
      italic:
        style.fontStyle === 'italic' || style.fontStyle.startsWith('oblique'),
      strike: decoration.includes('line-through'),
      underline: decoration.includes('underline'),
    }
  }

  function readBlockFormat(element: HTMLElement | null): MarkdownBlockStyleKind {
    const block = getClosestBlockElement(element)
    const tagName = block?.tagName.toLowerCase()

    if (tagName === 'li') {
      const listTag = block?.parentElement?.tagName.toLowerCase()
      if (listTag === 'ol') {
        return 'orderedList'
      }
      if (listTag === 'ul') {
        return 'bulletList'
      }
    }

    if (tagName === 'h1') {
      return 'heading1'
    }
    if (tagName === 'h2') {
      return 'heading2'
    }
    if (tagName === 'h3') {
      return 'heading3'
    }
    if (tagName === 'h4') {
      return 'heading4'
    }

    return 'paragraph'
  }

  function normalizeTextAlign(value: string | null | undefined): MarkdownTextAlignKind | null {
    const normalized = value?.trim().toLowerCase()
    if (!normalized) {
      return null
    }

    if (normalized === 'start') {
      return 'left'
    }
    if (normalized === 'end') {
      return 'right'
    }

    return normalized === 'center'
      || normalized === 'right'
      || normalized === 'justify'
      || normalized === 'left'
      ? normalized
      : null
  }

  function readAlignment(element: HTMLElement | null): MarkdownTextAlignKind {
    const block = getClosestBlockElement(element)
    if (!block || typeof window === 'undefined') {
      return 'left'
    }

    // 对齐样式可能挂在外层 `<hai-align>` 容器上，单读 block 的 inline style 会丢失真实状态。
    const alignHost = block.closest<HTMLElement>('.hai-md-align-block') || block
    const computedAlign = normalizeTextAlign(
      window.getComputedStyle(alignHost).textAlign,
    )
    const attributeAlignCandidate
      = alignHost.dataset.haiAlign
        || alignHost.getAttribute('align')
        || block.getAttribute('align')
    const attributeAlign = normalizeTextAlign(
      attributeAlignCandidate,
    )

    return computedAlign || attributeAlign || 'left'
  }

  function readSelectionFormatState(selection: Selection): SelectionFormatState {
    const anchorElement = getSelectionAnchorElement(selection)
    const colorHost = anchorElement?.closest<HTMLElement>('[data-hai-color], [data-hai-bg]')
    const linkHost = anchorElement?.closest<HTMLAnchorElement>('a[href]')
    const codeHost = anchorElement?.closest<HTMLElement>('code')
    const highlightHost = anchorElement?.closest<HTMLElement>('mark')
    const inlineState = readComputedInlineState(anchorElement)
    const hasHighlight = Boolean((highlightHost && previewHost?.contains(highlightHost)) || colorHost?.dataset.haiBg?.trim())
    const textColor = colorHost?.dataset.haiColor?.trim()
      || anchorElement?.closest<HTMLElement>('[data-hai-color]')?.dataset.haiColor
      || null
    const backgroundColor = colorHost?.dataset.haiBg?.trim()
      || anchorElement?.closest<HTMLElement>('[data-hai-bg]')?.dataset.haiBg
      || null

    return {
      blockFormat: readBlockFormat(anchorElement),
      alignment: readAlignment(anchorElement),
      bold: inlineState.bold,
      strike: inlineState.strike,
      italic: inlineState.italic,
      underline: inlineState.underline,
      highlight: hasHighlight,
      code: Boolean(codeHost && previewHost?.contains(codeHost)),
      linkHref:
        linkHost && previewHost?.contains(linkHost)
          ? (linkHost.getAttribute('href') ?? '')
          : '',
      textColor,
      backgroundColor,
    }
  }

  function readPreviewSelectionState(): PreviewSelectionState | null {
    if (typeof window === 'undefined' || !previewHost) {
      return null
    }

    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return null
    }

    const anchorNode = selection.anchorNode
    const focusNode = selection.focusNode
    if (
      !anchorNode
      || !focusNode
      || !previewHost.contains(anchorNode)
      || !previewHost.contains(focusNode)
    ) {
      return null
    }

    const text = selection.toString().trim()
    if (!text) {
      return null
    }

    return {
      selection,
      range: selection.getRangeAt(0),
      text,
    }
  }

  /**
   * 下面这组 helper 在 contenteditable DOM 与“正文纯文本偏移”之间来回映射。
   * 选区工具条一旦失焦或内容局部重渲染，就靠它们把原选区重新定位回来。
   */
  function getNodeTextLength(node: Node | null | undefined): number {
    if (!node) {
      return 0
    }

    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent?.length ?? 0
    }

    let length = 0
    for (const childNode of Array.from(node.childNodes)) {
      length += getNodeTextLength(childNode)
    }

    return length
  }

  function getTextOffsetWithinNode(node: Node, offset: number): number {
    if (node.nodeType === Node.TEXT_NODE) {
      return Math.max(0, Math.min(offset, node.textContent?.length ?? 0))
    }

    const childNodes = Array.from(node.childNodes)
    const nextOffset = Math.max(0, Math.min(offset, childNodes.length))
    let length = 0

    for (const childNode of childNodes.slice(0, nextOffset)) {
      length += getNodeTextLength(childNode)
    }

    return length
  }

  function getTextOffsetBeforeNode(root: Node, target: Node): number | null {
    let length = 0

    const visit = (node: Node): boolean => {
      if (node === target) {
        return true
      }

      if (node.nodeType === Node.TEXT_NODE) {
        length += node.textContent?.length ?? 0
        return false
      }

      for (const childNode of Array.from(node.childNodes)) {
        if (visit(childNode)) {
          return true
        }
      }

      return false
    }

    return visit(root) ? length : null
  }

  function getTextOffsetInPreview(node: Node, offset: number): number | null {
    if (!previewHost || (node !== previewHost && !previewHost.contains(node))) {
      return null
    }

    const prefixLength = getTextOffsetBeforeNode(previewHost, node)
    if (prefixLength === null) {
      return null
    }

    return prefixLength + getTextOffsetWithinNode(node, offset)
  }

  function resolveTextPositionInPreview(
    offset: number,
  ): { node: Node, offset: number } | null {
    if (!previewHost) {
      return null
    }

    const targetOffset = Math.max(0, offset)
    const walker = document.createTreeWalker(previewHost, NodeFilter.SHOW_TEXT)
    let current = walker.nextNode()
    let accumulatedLength = 0
    let lastTextNode: Node | null = null

    while (current) {
      const textLength = current.textContent?.length ?? 0
      if (targetOffset <= accumulatedLength + textLength) {
        return {
          node: current,
          offset: Math.max(0, targetOffset - accumulatedLength),
        }
      }

      accumulatedLength += textLength
      lastTextNode = current
      current = walker.nextNode()
    }

    if (lastTextNode) {
      return {
        node: lastTextNode,
        offset: lastTextNode.textContent?.length ?? 0,
      }
    }

    return {
      node: previewHost,
      offset: Math.min(targetOffset, previewHost.childNodes.length),
    }
  }

  /**
   * 把当前 Range 压缩成纯文本偏移快照。
   * 只记录非空选区，避免工具条动作把折叠光标也当成可恢复选区。
   */
  function capturePreviewSelectionSnapshot(
    range: Range,
  ): MarkdownSelectionSnapshot | null {
    if (!previewHost) {
      return null
    }

    const start = getTextOffsetInPreview(range.startContainer, range.startOffset)
    const end = getTextOffsetInPreview(range.endContainer, range.endOffset)
    const text = range.toString()

    if (start === null || end === null || end <= start || !text.trim()) {
      return null
    }

    return { start, end, text }
  }

  /**
   * 用快照重新读取一遍当前正文中的文本，用来判断 DOM 变化后原 offsets 是否仍然可信。
   */
  function readTextFromSnapshot(
    snapshot: MarkdownSelectionSnapshot,
  ): string | null {
    const startPosition = resolveTextPositionInPreview(snapshot.start)
    const endPosition = resolveTextPositionInPreview(snapshot.end)
    if (!startPosition || !endPosition) {
      return null
    }

    try {
      const range = document.createRange()
      range.setStart(startPosition.node, startPosition.offset)
      range.setEnd(endPosition.node, endPosition.offset)
      return range.toString()
    }
    catch {
      return null
    }
  }

  /**
   * 当原 offsets 对应的文本已经变了时，按“离旧起点最近”的同文本片段回退。
   * 这样比只取第一个命中更接近用户刚才真实操作的位置。
   */
  function findClosestSelectionOffsets(
    snapshot: MarkdownSelectionSnapshot,
  ): { start: number, end: number } | null {
    if (!previewHost || !snapshot.text) {
      return null
    }

    const textContent = previewHost.textContent ?? ''
    let bestMatchStart = -1
    let smallestDistance = Number.POSITIVE_INFINITY
    let searchIndex = textContent.indexOf(snapshot.text)

    while (searchIndex >= 0) {
      const distance = Math.abs(searchIndex - snapshot.start)
      if (distance < smallestDistance) {
        smallestDistance = distance
        bestMatchStart = searchIndex
      }

      searchIndex = textContent.indexOf(snapshot.text, searchIndex + 1)
    }

    if (bestMatchStart < 0) {
      return null
    }

    return {
      start: bestMatchStart,
      end: bestMatchStart + snapshot.text.length,
    }
  }

  /**
   * 优先按纯文本偏移恢复选区；如果 DOM 结构变动导致 offsets 漂移，再退回最近文本片段。
   * 这一步会主动把焦点拉回正文，保证后续格式化命令仍作用于内容区。
   */
  function restoreSelectionFromSnapshot(
    snapshot: MarkdownSelectionSnapshot,
  ): boolean {
    if (typeof window === 'undefined' || !previewHost) {
      return false
    }

    const selection = window.getSelection()
    if (!selection || snapshot.end <= snapshot.start) {
      return false
    }

    let nextOffsets = {
      start: snapshot.start,
      end: snapshot.end,
    }
    const currentText = readTextFromSnapshot(snapshot)
    if (snapshot.text && currentText !== snapshot.text) {
      const matchedOffsets = findClosestSelectionOffsets(snapshot)
      if (!matchedOffsets) {
        return false
      }

      nextOffsets = matchedOffsets
    }

    const startPosition = resolveTextPositionInPreview(nextOffsets.start)
    const endPosition = resolveTextPositionInPreview(nextOffsets.end)
    if (!startPosition || !endPosition) {
      return false
    }

    try {
      const range = document.createRange()
      range.setStart(startPosition.node, startPosition.offset)
      range.setEnd(endPosition.node, endPosition.offset)
      previewHost.focus()
      selection.removeAllRanges()
      selection.addRange(range)
      return true
    }
    catch {
      return false
    }
  }

  /**
   * 纯文本匹配是最后一道兜底，只在 Range 和偏移快照都失效时使用。
   * 它无法区分完全相同的多个片段，所以只适合作为尽力恢复方案。
   */
  function restoreSelectionByTextMatch(text: string): boolean {
    if (typeof window === 'undefined' || !previewHost || !text.trim()) {
      return false
    }

    const selection = window.getSelection()
    if (!selection) {
      return false
    }

    const walker = document.createTreeWalker(previewHost, NodeFilter.SHOW_TEXT)
    let current = walker.nextNode()

    while (current) {
      const content = current.textContent ?? ''
      const start = content.indexOf(text)
      if (start >= 0) {
        try {
          const range = document.createRange()
          range.setStart(current, start)
          range.setEnd(current, start + text.length)
          previewHost.focus()
          selection.removeAllRanges()
          selection.addRange(range)
          return true
        }
        catch {
          return false
        }
      }

      current = walker.nextNode()
    }

    return false
  }

  /**
   * 工具条包含输入框和下拉面板，焦点落在内部时不应把“正文失焦”误判成关闭信号。
   */
  function isSelectionChromeFocused(): boolean {
    if (typeof document === 'undefined' || !selectionChromeEl) {
      return false
    }

    const activeElement = document.activeElement
    return activeElement instanceof HTMLElement && selectionChromeEl.contains(activeElement)
  }

  /**
   * 同时保存浏览器原生 Range 和纯文本快照。
   * 前者恢复精度更高，后者能跨 DOM 重建，两者组合能覆盖大多数编辑场景。
   */
  function rememberPreviewSelection(range: Range): void {
    savedSelectionRange = range.cloneRange()
    savedSelectionSnapshot = capturePreviewSelectionSnapshot(range)
  }

  /**
   * 选区恢复按“快照 -> 原始 Range -> 文本兜底”三层顺序尝试。
   * 这样既优先命中最精确的位置，也能在内容轻微重排后保留工具条操作连续性。
   */
  function restoreSavedPreviewSelection(): boolean {
    if (savedSelectionSnapshot && restoreSelectionFromSnapshot(savedSelectionSnapshot)) {
      return true
    }

    if (typeof window === 'undefined' || !previewHost || !savedSelectionRange) {
      const fallbackText = savedSelectionSnapshot?.text || selectedText
      return restoreSelectionByTextMatch(fallbackText)
    }

    const selection = window.getSelection()
    if (!selection) {
      return false
    }

    try {
      const restoredRange = savedSelectionRange.cloneRange()
      if (
        !previewHost.contains(restoredRange.startContainer)
        || !previewHost.contains(restoredRange.endContainer)
      ) {
        return false
      }

      previewHost.focus()
      selection.removeAllRanges()
      selection.addRange(restoredRange)
      return true
    }
    catch {
      const fallbackText = savedSelectionSnapshot?.text || selectedText
      return restoreSelectionByTextMatch(fallbackText)
    }
  }

  /**
   * 工具条动作触发前先同步一次真实选区，避免点击按钮后浏览器把正文选区清掉。
   */
  function syncSelectionForToolbarAction(): boolean {
    const previewSelection = readPreviewSelectionState()
    if (previewSelection) {
      rememberPreviewSelection(previewSelection.range)
      selectedText = previewSelection.text
      return true
    }

    return restoreSavedPreviewSelection()
  }

  /**
   * 所有关闭动作都走同一个 timer，方便菜单 hover、输入框 focus 等场景随时撤销关闭。
   */
  function clearPendingSelectionToolbarClose(): void {
    if (typeof window === 'undefined' || !selectionToolbarCloseTimer) {
      return
    }

    window.clearTimeout(selectionToolbarCloseTimer)
    selectionToolbarCloseTimer = undefined
  }

  /**
   * 关闭工具条刻意延后一小拍，给菜单 hover、输入框 focus 和选区回流留出时间。
   * 只要子菜单还开着，或焦点仍在 chrome 里，就继续保留当前工具条。
   */
  function scheduleSelectionToolbarClose(): void {
    if (typeof window === 'undefined') {
      closeSelectionToolbar()
      return
    }

    if (!selectionToolbarVisible) {
      closeSelectionToolbar()
      return
    }

    if (activeSelectionMenu) {
      return
    }

    clearPendingSelectionToolbarClose()
    selectionToolbarCloseTimer = window.setTimeout(() => {
      selectionToolbarCloseTimer = undefined
      if (activeSelectionMenu || isSelectionChromeFocused()) {
        return
      }

      if (!readPreviewSelectionState()) {
        closeSelectionToolbar()
      }
    }, 600)
  }

  /**
   * 选区变化可能在一帧内收到多次事件，这里统一合并，避免定位和状态读取来回抖动。
   */
  function queueSelectionRefresh(remeasured = false): void {
    if (typeof window === 'undefined') {
      return
    }

    selectionRefreshNeedsRemeasure ||= remeasured
    if (selectionRefreshFrame) {
      return
    }

    selectionRefreshFrame = window.requestAnimationFrame(() => {
      const nextRemeasured = selectionRefreshNeedsRemeasure
      selectionRefreshFrame = undefined
      selectionRefreshNeedsRemeasure = false
      handleSelectionChange(nextRemeasured)
    })
  }

  /**
   * 子菜单首次打开前拿不到真实宽度，先给一个稳定的经验值参与贴边计算。
   */
  function estimateSelectionMenuWidth(menu: SelectionMenuKind): number {
    if (menu === 'color' || menu === 'link') {
      return 256
    }

    if (menu === 'rewrite') {
      return 320
    }

    return 288
  }

  /**
   * 下拉面板以触发按钮为锚点，但最终位置要限制在工具条宽度内，避免菜单越界裁切。
   */
  function updateSelectionMenuAnchor(menu: SelectionMenuKind): void {
    if (!selectionToolbarEl || !activeSelectionMenuTrigger) {
      selectionMenuLeft = 0
      selectionMenuAlignment = 'center'
      return
    }

    const toolbarWidth = Math.max(
      selectionToolbarEl.offsetWidth,
      selectionToolbarEl.clientWidth,
    )
    const triggerCenter
      = activeSelectionMenuTrigger.offsetLeft
        + activeSelectionMenuTrigger.offsetWidth / 2
    const estimatedHalfWidth = Math.min(
      estimateSelectionMenuWidth(menu) / 2,
      Math.max(112, (toolbarWidth - 16) / 2),
    )
    const minCenter = 8 + estimatedHalfWidth
    const maxCenter = Math.max(minCenter, toolbarWidth - 8 - estimatedHalfWidth)

    if (triggerCenter <= minCenter) {
      selectionMenuLeft = 0
      selectionMenuAlignment = 'left'
      return
    }

    if (triggerCenter >= maxCenter) {
      selectionMenuLeft = toolbarWidth
      selectionMenuAlignment = 'right'
      return
    }

    selectionMenuLeft = triggerCenter
    selectionMenuAlignment = 'center'
  }

  /**
   * 工具条初次出现时尺寸还没稳定，下一帧再量一次可以避免首帧贴边位置偏差。
   */
  function scheduleSelectionToolbarMeasurement(): void {
    if (
      typeof window === 'undefined'
      || selectionToolbarMeasurePending
      || !selectionToolbarVisible
    ) {
      return
    }

    selectionToolbarMeasurePending = true
    window.requestAnimationFrame(() => {
      selectionToolbarMeasurePending = false
      if (selectionToolbarVisible) {
        handleSelectionChange(true)
      }
    })
  }

  /**
   * 子菜单统一从这里开关，顺手记录触发按钮和链接初始值，保证定位与默认值一致。
   */
  function toggleSelectionMenu(menu: SelectionMenuKind, event?: MouseEvent): void {
    clearPendingSelectionToolbarClose()
    const opening = activeSelectionMenu !== menu
    activeSelectionMenu = opening ? menu : null
    activeSelectionMenuTrigger = opening && event?.currentTarget instanceof HTMLElement
      ? event.currentTarget
      : null
    if (opening) {
      updateSelectionMenuAnchor(menu)
    }
    if (opening && menu === 'link') {
      linkDraft = selectionFormatState.linkHref || 'https://'
    }
  }

  /**
   * 关闭时把选区相关缓存一并清干净，避免下一次打开还误用上一次的链接和格式状态。
   */
  function closeSelectionToolbar(): void {
    clearPendingSelectionToolbarClose()
    selectionToolbarVisible = false
    activeSelectionMenu = null
    activeSelectionMenuTrigger = null
    selectionMenuLeft = 0
    selectionMenuAlignment = 'center'
    selectedText = ''
    linkDraft = ''
    savedSelectionRange = null
    savedSelectionSnapshot = null
    selectionFormatState = { ...DEFAULT_SELECTION_FORMAT_STATE }
  }

  /**
   * 面板上的按钮点击不应让浏览器先把正文选区清掉。
   * 但输入框要保留原生 focus 行为，方便直接编辑链接。
   */
  function handleSelectionPanelMouseDown(event: MouseEvent): void {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return
    }

    event.preventDefault()
  }

  function clearPendingHoveredLinkHide(): void {
    if (typeof window === 'undefined' || !hoveredLinkHideTimer) {
      return
    }

    window.clearTimeout(hoveredLinkHideTimer)
    hoveredLinkHideTimer = undefined
  }

  function closeHoveredLink(): void {
    clearPendingHoveredLinkHide()
    hoveredLinkState = null
  }

  function scheduleHoveredLinkHide(): void {
    if (typeof window === 'undefined') {
      closeHoveredLink()
      return
    }

    clearPendingHoveredLinkHide()
    hoveredLinkHideTimer = window.setTimeout(() => {
      hoveredLinkHideTimer = undefined
      hoveredLinkState = null
    }, 140)
  }

  function resolveHoveredLinkTargets(
    link: HTMLAnchorElement,
  ): { href: string, rawHref: string } | null {
    const rawHref = link.getAttribute('href')?.trim() ?? ''
    const href = link.href.trim() || rawHref
    if (!href) {
      return null
    }

    return {
      href,
      rawHref: rawHref || href,
    }
  }

  function measureHoveredLinkPopover(): { width: number, height: number } {
    const width = hoveredLinkPopoverEl
      ? Math.max(
        hoveredLinkPopoverEl.offsetWidth,
        hoveredLinkPopoverEl.clientWidth,
      )
      : 92
    const height = hoveredLinkPopoverEl
      ? Math.max(
        hoveredLinkPopoverEl.offsetHeight,
        hoveredLinkPopoverEl.clientHeight,
      )
      : 40

    return { width, height }
  }

  function buildHoveredLinkState(
    link: HTMLAnchorElement,
  ): HoveredLinkState | null {
    if (!editorScrollHost || !previewHost || !previewHost.contains(link)) {
      return null
    }

    const targets = resolveHoveredLinkTargets(link)
    if (!targets) {
      return null
    }

    const hostRect = editorScrollHost.getBoundingClientRect()
    const linkRect = link.getBoundingClientRect()
    const { width, height } = measureHoveredLinkPopover()
    const offset = 8
    const horizontalPadding = 16
    const topSpace = linkRect.top - hostRect.top
    const bottomSpace = hostRect.bottom - linkRect.bottom
    const placement: HoveredLinkState['placement']
      = topSpace >= height + offset || bottomSpace < height + offset
        ? 'top'
        : 'bottom'
    const center = linkRect.left - hostRect.left + linkRect.width / 2
    const maxLeft = Math.max(
      horizontalPadding,
      editorScrollHost.clientWidth - horizontalPadding - width,
    )
    const left = Math.min(
      Math.max(center - width / 2, horizontalPadding),
      maxLeft,
    )
    const top = placement === 'top'
      ? editorScrollHost.scrollTop + linkRect.top - hostRect.top - height - offset
      : editorScrollHost.scrollTop + linkRect.bottom - hostRect.top + offset

    return {
      element: link,
      href: targets.href,
      rawHref: targets.rawHref,
      top: Math.max(8, top),
      left,
      placement,
    }
  }

  function syncHoveredLinkPosition(): void {
    if (!hoveredLinkState) {
      return
    }

    if (!hoveredLinkState.element.isConnected) {
      closeHoveredLink()
      return
    }

    const nextState = buildHoveredLinkState(hoveredLinkState.element)
    if (!nextState) {
      closeHoveredLink()
      return
    }

    hoveredLinkState = nextState
  }

  function resolveColorOptionValue(colorOption: string | ColorSwatchOption): string | null {
    return typeof colorOption === 'string' ? colorOption : colorOption.value
  }

  function updateHoveredLink(link: HTMLAnchorElement | null): void {
    if (!editable || !onapplylink || selectionToolbarVisible) {
      closeHoveredLink()
      return
    }

    if (!link) {
      scheduleHoveredLinkHide()
      return
    }

    const nextState = buildHoveredLinkState(link)
    if (!nextState) {
      scheduleHoveredLinkHide()
      return
    }

    clearPendingHoveredLinkHide()
    hoveredLinkState = nextState
  }

  function openHoveredLink(): void {
    if (typeof window === 'undefined' || !hoveredLinkState?.href) {
      return
    }

    window.open(
      hoveredLinkState.href,
      hoveredLinkState.element.target || '_blank',
      'noopener,noreferrer',
    )
  }

  function createRangeForLinkText(link: HTMLAnchorElement): Range {
    const range = document.createRange()
    const walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT)
    let current = walker.nextNode()
    let firstTextNode: Node | null = null
    let lastTextNode: Node | null = null

    while (current) {
      if ((current.textContent ?? '').length > 0) {
        firstTextNode ??= current
        lastTextNode = current
      }

      current = walker.nextNode()
    }

    if (!firstTextNode || !lastTextNode) {
      range.selectNodeContents(link)
      return range
    }

    range.setStart(firstTextNode, 0)
    range.setEnd(lastTextNode, lastTextNode.textContent?.length ?? 0)
    return range
  }

  async function editHoveredLink(): Promise<void> {
    if (
      typeof window === 'undefined'
      || !previewHost
      || !onapplylink
      || !hoveredLinkState
    ) {
      return
    }

    const link = hoveredLinkState.element
    const linkHref = hoveredLinkState.rawHref
    if (!previewHost.contains(link)) {
      closeHoveredLink()
      return
    }

    const selection = window.getSelection()
    if (!selection) {
      return
    }

    const range = createRangeForLinkText(link)
    previewHost.focus()
    selection.removeAllRanges()
    selection.addRange(range)
    rememberPreviewSelection(range)
    selectedText = range.toString().trim()
    closeHoveredLink()
    handleSelectionChange(true)
    await tick()
    linkDraft = linkHref || 'https://'
    activeSelectionMenu = 'link'
    activeSelectionMenuTrigger = selectionLinkButtonEl
    if (selectionLinkButtonEl) {
      updateSelectionMenuAnchor('link')
    }
  }

  /**
   * 目录高亮不依赖 IntersectionObserver，而是按滚动容器内标题的相对位置推断。
   * 这样正文持续流式刷新时不需要反复重建 observer，也更容易和目录点击滚动保持一致。
   */
  function syncActiveHeadingFromScroll(): void {
    if (!editorScrollHost || !previewHost || !outlineHasContent) {
      return
    }

    const headings = [
      ...previewHost.querySelectorAll<HTMLElement>('[data-heading-id]'),
    ]
    if (headings.length === 0) {
      return
    }

    const hostRect = editorScrollHost.getBoundingClientRect()
    let nextActiveId = headings[0]?.dataset.headingId ?? ''

    for (const heading of headings) {
      const headingId = heading.dataset.headingId
      if (!headingId) {
        continue
      }

      const top = heading.getBoundingClientRect().top - hostRect.top
      if (top <= 72) {
        nextActiveId = headingId
      }
      else {
        break
      }
    }

    activeHeadingId = nextActiveId
  }

  function syncPinnedTitleVisibility(): void {
    if (!title) {
      showPinnedTitle = false
      return
    }

    if (!editorScrollHost || !previewHost) {
      showPinnedTitle = true
      return
    }

    const firstHeading
      = previewHost.querySelector<HTMLElement>('[data-heading-id]')
    if (!firstHeading) {
      showPinnedTitle = true
      return
    }

    const headingTop = firstHeading.offsetTop - editorScrollHost.scrollTop
    const headingBottom = headingTop + firstHeading.offsetHeight
    showPinnedTitle = headingBottom <= 20
  }

  function handleDocumentScroll(event: Event): void {
    syncActiveHeadingFromScroll()
    syncPinnedTitleVisibility()
    syncHoveredLinkPosition()
    if (selectionToolbarVisible) {
      queueSelectionRefresh(true)
    }
    ondocumentscroll?.(event)
  }

  function scrollToHeading(id: string): void {
    if (!editorScrollHost || !previewHost) {
      return
    }

    const target = previewHost.querySelector<HTMLElement>(`#${CSS.escape(id)}`)
    if (!target) {
      return
    }

    activeHeadingId = id
    const offsetTop = Math.max(0, target.offsetTop - 16)
    editorScrollHost.scrollTo({ top: offsetTop, behavior: 'smooth' })
  }

  /**
   * 选区工具条依赖真实 DOM 选区范围，因此只在 selection 落在当前正文容器内时显示。
   * 一旦内容刷新或滚动位置变化，就主动关闭，避免把旧选区动作误用到新内容上。
   */
  function handleSelectionChange(remeasured = false): void {
    if (
      !selectionToolsEnabled
      || typeof window === 'undefined'
      || !previewHost
      || !editorScrollHost
    ) {
      return
    }

    clearPendingSelectionToolbarClose()

    const previewSelection = readPreviewSelectionState()
    if (!previewSelection) {
      if (savedSelectionRange && isSelectionChromeFocused()) {
        return
      }

      scheduleSelectionToolbarClose()
      return
    }

    const { selection, range, text } = previewSelection
    hoveredLinkState = null
    const rect = range.getBoundingClientRect()
    const hostRect = editorScrollHost.getBoundingClientRect()
    // 浮层尺寸在首次渲染前拿不到精确高度，这里用稳定的经验值决定上下避让方向，避免直接盖住选中文本。
    const estimatedToolbarHeight = 60
    const offset = 12
    const topSpace = rect.top - hostRect.top
    const bottomSpace = hostRect.bottom - rect.bottom
    const placement: SelectionToolbarPosition['placement']
      = topSpace >= estimatedToolbarHeight + offset
        || bottomSpace < estimatedToolbarHeight
        ? 'top'
        : 'bottom'
    const center = rect.left - hostRect.left + rect.width / 2
    const horizontalPadding = 16
    const outlineOverlap = outlinePanelEl
      ? Math.max(
        0,
        Math.min(
          outlinePanelEl.getBoundingClientRect().right,
          hostRect.right,
        ) - hostRect.left,
      )
      : 0
    const minLeft = Math.max(
      horizontalPadding,
      outlineOverlap > 24 ? outlineOverlap + 12 : horizontalPadding,
    )
    const measuredToolbarWidth = selectionChromeEl
      ? Math.max(selectionChromeEl.offsetWidth, selectionChromeEl.clientWidth)
      : selectionToolbarEl
      ? Math.max(selectionToolbarEl.offsetWidth, selectionToolbarEl.clientWidth)
      : 360
    const maxToolbarWidth = Math.max(
      220,
      editorScrollHost.clientWidth - minLeft - horizontalPadding,
    )
    const toolbarWidth = Math.min(measuredToolbarWidth, maxToolbarWidth)
    const maxLeft = Math.max(
      minLeft,
      editorScrollHost.clientWidth - horizontalPadding - toolbarWidth,
    )
    const unclampedLeft = center - toolbarWidth / 2
    const toolbarLeft = Math.min(Math.max(unclampedLeft, minLeft), maxLeft)
    const alignment: SelectionToolbarPosition['alignment']
      = toolbarLeft <= minLeft + 0.5
        ? 'left'
        : toolbarLeft >= maxLeft - 0.5
        ? 'right'
        : 'center'
    const toolbarTop = placement === 'top'
      ? editorScrollHost.scrollTop + rect.top - hostRect.top - estimatedToolbarHeight - offset
      : editorScrollHost.scrollTop + rect.bottom - hostRect.top + offset

    selectedText = text
    rememberPreviewSelection(range)
    selectionToolbarVisible = true
    selectionFormatState = readSelectionFormatState(selection)
    toolbarPosition = {
      top: Math.max(12, toolbarTop),
      left: Math.max(horizontalPadding, toolbarLeft),
      placement,
      alignment,
    }

    if (activeSelectionMenu) {
      updateSelectionMenuAnchor(activeSelectionMenu)
    }

    if (!remeasured) {
      scheduleSelectionToolbarMeasurement()
    }
  }

  async function applyRewrite(actionId: string): Promise<void> {
    if (!onrewrite || !selectedText.trim()) {
      return
    }

    activeSelectionMenu = null
    activeSelectionMenuTrigger = null
    await onrewrite({
      actionId,
      selectedText,
      content,
      title: title || undefined,
    })
  }

  function applyBlockFormat(kind: MarkdownBlockFormatKind): void {
    if (!syncSelectionForToolbarAction()) {
      return
    }

    onapplyblockformat?.(kind)
    activeSelectionMenu = null
    activeSelectionMenuTrigger = null
    queueSelectionRefresh()
  }

  function applyBlockStyle(kind: MarkdownBlockStyleKind): void {
    if (!syncSelectionForToolbarAction()) {
      return
    }

    onapplyblockstyle?.(kind)
    activeSelectionMenu = null
    activeSelectionMenuTrigger = null
    queueSelectionRefresh()
  }

  /**
   * 行内样式按钮允许连续点按，因此这里不主动关掉工具条，只刷新状态。
   */
  function applyInlineFormat(kind: MarkdownInlineFormatKind): void {
    if (!syncSelectionForToolbarAction()) {
      return
    }

    clearPendingSelectionToolbarClose()
    onapplyinlineformat?.(kind)
    queueSelectionRefresh()
  }

  function applyAlignment(kind: MarkdownTextAlignKind): void {
    if (!syncSelectionForToolbarAction()) {
      return
    }

    onapplyalignment?.(kind)
    activeSelectionMenu = null
    activeSelectionMenuTrigger = null
    queueSelectionRefresh()
  }

  /**
   * 链接菜单提交时总是以恢复后的正文选区为准，避免输入框焦点把目标文本丢掉。
   */
  function applyLink(): void {
    if (!syncSelectionForToolbarAction()) {
      return
    }

    onapplylink?.(
      linkDraft.trim() || null,
      savedSelectionSnapshot
        ? {
          ...savedSelectionSnapshot,
        }
        : undefined,
      selectedText.trim() || undefined,
    )
    activeSelectionMenu = null
    activeSelectionMenuTrigger = null
    queueSelectionRefresh()
  }

  function removeLink(): void {
    if (!syncSelectionForToolbarAction()) {
      return
    }

    onapplylink?.(
      null,
      savedSelectionSnapshot
        ? {
          ...savedSelectionSnapshot,
        }
        : undefined,
      selectedText.trim() || undefined,
    )
    activeSelectionMenu = null
    activeSelectionMenuTrigger = null
    queueSelectionRefresh()
  }

  /**
   * 颜色动作除了颜色值，还会把当前选中文本一起带给外层，供宿主侧做兜底选区恢复。
   */
  function applyColor(request: MarkdownColorFormatRequest): void {
    if (!syncSelectionForToolbarAction()) {
      return
    }

    onapplycolor?.({
      ...request,
      selectedText: selectedText.trim() || undefined,
      selectionSnapshot: savedSelectionSnapshot
        ? {
          ...savedSelectionSnapshot,
        }
        : undefined,
    })
    queueSelectionRefresh()
  }

  async function copySelection(): Promise<void> {
    if (!syncSelectionForToolbarAction()) {
      return
    }

    await oncopyselection?.()
    activeSelectionMenu = null
    activeSelectionMenuTrigger = null
  }

  async function annotateSelection(): Promise<void> {
    if (!syncSelectionForToolbarAction()) {
      return
    }

    await onannotation?.()
    activeSelectionMenu = null
    activeSelectionMenuTrigger = null
  }

  function handlePreviewMouseMove(event: MouseEvent): void {
    const target = event.target
    const link = target instanceof Element
      ? target.closest<HTMLAnchorElement>('a[href]')
      : null

    updateHoveredLink(link && previewHost?.contains(link) ? link : null)
  }

  function handlePreviewMouseLeave(): void {
    scheduleHoveredLinkHide()
  }

  /**
   * mouseup 比 selectionchange 更接近用户“完成一次选中”的时机，适合触发工具条刷新。
   */
  function handlePreviewMouseUp(): void {
    queueSelectionRefresh()
    onpreviewmouseup?.()
  }

  /**
   * 输入事件本身只透传给宿主；选区状态交给 selectionchange/mouseup 统一管理。
   */
  function handlePreviewInput(event: Event): void {
    onpreviewinput?.(event)
  }

  /**
   * 正文失焦时先观察焦点是否转移到工具条内部，避免点击链接输入框时误触发提交或收起。
   */
  function handlePreviewBlur(event: FocusEvent): void {
    queueSelectionRefresh(true)

    const nextTarget = event.relatedTarget
    if (nextTarget instanceof Node && selectionChromeEl?.contains(nextTarget)) {
      return
    }

    onpreviewblur?.()
  }
</script>

<section class={cn('hai-ai-doc-pane', className)}>
  <div class='hai-ai-doc-shell'>
    {#if showToolbar}
      <header class='hai-ai-doc-topbar'>
        <div class='hai-ai-doc-meta-bar'>
          <div class='hai-ai-doc-toolbar-heading'>
            {#if showOutline && outlineCollapsed}
              <button
                type='button'
                class='hai-ai-doc-outline-open'
                aria-label={uiM('markdown_show_outline')}
                title={uiM('markdown_show_outline')}
                onclick={() => (outlineCollapsed = false)}
              >
                <svg viewBox='0 0 24 24' aria-hidden='true'>
                  <path
                    d='M5.75 7.25a.75.75 0 0 1 .75-.75h11a.75.75 0 0 1 0 1.5h-11a.75.75 0 0 1-.75-.75Zm0 4.75a.75.75 0 0 1 .75-.75h11a.75.75 0 0 1 0 1.5h-11a.75.75 0 0 1-.75-.75Zm0 4.75a.75.75 0 0 1 .75-.75h11a.75.75 0 0 1 0 1.5h-11a.75.75 0 0 1-.75-.75Z'
                  ></path>
                </svg>
              </button>
            {/if}

            {#if showPinnedTitle && title}
              <div class='hai-ai-doc-title-block'>
                <h2>{title}</h2>
              </div>
            {/if}
          </div>

          <div class='hai-ai-doc-toolbar'>
            {#if onundo}
              <button
                type='button'
                class='hai-ai-doc-toolbar-icon'
                aria-label={uiM('markdown_undo')}
                title={`${uiM('markdown_undo')} (Ctrl/Cmd+Z)`}
                disabled={undoDisabled}
                onclick={onundo}
              >
                <svg viewBox='0 0 24 24' aria-hidden='true'>
                  <path
                    d='M10.2 6.05a7.25 7.25 0 1 1-4.82 6.83.75.75 0 0 1 1.5 0 5.75 5.75 0 1 0 3.82-5.42V10a.75.75 0 1 1-1.5 0V4a.75.75 0 0 1 .75-.75h6a.75.75 0 0 1 0 1.5H10.2v1.3Z'
                  ></path>
                </svg>
              </button>
            {/if}

            {#if onredo}
              <button
                type='button'
                class='hai-ai-doc-toolbar-icon'
                aria-label={uiM('markdown_redo')}
                title={`${uiM('markdown_redo')} (Ctrl/Cmd+Shift+Z)`}
                disabled={redoDisabled}
                onclick={onredo}
              >
                <svg viewBox='0 0 24 24' aria-hidden='true'>
                  <path
                    d='M13.8 6.05V4.75h-5.75a.75.75 0 0 1 0-1.5h6A.75.75 0 0 1 14.8 4v6a.75.75 0 1 1-1.5 0V7.46a5.75 5.75 0 1 0 3.82 5.42.75.75 0 0 1 1.5 0 7.25 7.25 0 1 1-4.82-6.83Z'
                  ></path>
                </svg>
              </button>
            {/if}

            {#if onundo || onredo}
              <span class='hai-ai-doc-toolbar-divider'></span>
            {/if}

            <button
              type='button'
              class={cn(
                'hai-ai-doc-toolbar-pill',
                documentCopied ? 'hai-ai-doc-toolbar-pill--success' : '',
              )}
              aria-label={uiM('markdown_copy_document')}
              title={uiM('markdown_copy_document')}
              onclick={handleCopyDocument}
            >
              {#if documentCopied}
                <svg viewBox='0 0 24 24' aria-hidden='true'>
                  <path
                    d='M20.3 6.28a.75.75 0 0 1 .02 1.06l-8.06 8.38a.75.75 0 0 1-1.07.01L7.7 12.3a.75.75 0 1 1 1.06-1.06l2.9 2.9 7.58-7.88a.75.75 0 0 1 1.06.02Z'
                  ></path>
                </svg>
              {:else}
                <svg viewBox='0 0 24 24' aria-hidden='true'>
                  <path
                    d='M8.75 4.25A2.75 2.75 0 0 0 6 7v8.25A2.75 2.75 0 0 0 8.75 18h7.5A2.75 2.75 0 0 0 19 15.25V7a2.75 2.75 0 0 0-2.75-2.75h-7.5Zm-4 3A2.75 2.75 0 0 1 7.5 4.5a.75.75 0 0 0 0-1.5A4.25 4.25 0 0 0 3.25 7.25v8.5A4.25 4.25 0 0 0 7.5 20a.75.75 0 0 0 0-1.5 2.75 2.75 0 0 1-2.75-2.75v-8.5Z'
                  ></path>
                </svg>
              {/if}
              <span>{uiM('markdown_copy_document')}</span>
            </button>

            <AiDocumentDownloadMenu
              {content}
              {title}
              {sourceKind}
              {codeLanguage}
              actions={downloadActions}
              {ondownload}
              showLabel={true}
              iconOnly={false}
              triggerTitle={uiM('markdown_download')}
              triggerClass='hai-ai-doc-toolbar-pill'
            />

            {#if onhistory}
              <span class='hai-ai-doc-toolbar-divider'></span>
              <button
                type='button'
                class='hai-ai-doc-toolbar-action'
                onclick={onhistory}
              >
                {historyActionLabel}
              </button>
            {/if}

            {#if onclose}
              <button
                type='button'
                class='hai-ai-doc-toolbar-close'
                aria-label={uiM('markdown_close')}
                disabled={closeDisabled}
                title={uiM('markdown_close')}
                onclick={onclose}
              >
                <svg viewBox='0 0 24 24' aria-hidden='true'>
                  <path
                    d='M6.97 5.91a.75.75 0 0 1 1.06 0L12 9.88l3.97-3.97a.75.75 0 1 1 1.06 1.06L13.06 10.94l3.97 3.97a.75.75 0 1 1-1.06 1.06L12 12l-3.97 3.97a.75.75 0 1 1-1.06-1.06l3.97-3.97-3.97-3.97a.75.75 0 0 1 0-1.06Z'
                  ></path>
                </svg>
              </button>
            {/if}
          </div>
        </div>
      </header>
    {/if}

    <div
      class:hai-ai-doc-layout-collapsed={!showOutline || outlineCollapsed}
      class='hai-ai-doc-layout'
    >
      {#if showOutline && !outlineCollapsed}
        <aside bind:this={outlinePanelEl} class='hai-ai-doc-outline'>
          <div class='hai-ai-doc-outline-head'>
            <strong>{uiM('markdown_outline')}</strong>

            <button
              type='button'
              class='hai-ai-doc-outline-toggle'
              aria-label={uiM('markdown_hide_outline')}
              title={uiM('markdown_hide_outline')}
              onclick={() => (outlineCollapsed = true)}
            >
              <svg viewBox='0 0 24 24' aria-hidden='true'>
                <path
                  d='M11.78 6.22a.75.75 0 0 1 0 1.06L7.06 12l4.72 4.72a.75.75 0 0 1-1.06 1.06l-5.25-5.25a.75.75 0 0 1 0-1.06l5.25-5.25a.75.75 0 0 1 1.06 0Zm6 0a.75.75 0 0 1 0 1.06L13.06 12l4.72 4.72a.75.75 0 1 1-1.06 1.06l-5.25-5.25a.75.75 0 0 1 0-1.06l5.25-5.25a.75.75 0 0 1 1.06 0Z'
                ></path>
              </svg>
            </button>
          </div>

          {#if outlineHasContent}
            <nav class='hai-ai-doc-outline-list'>
              {#each outline as item (item.id)}
                <button
                  type='button'
                  class:active={activeHeadingId === item.id}
                  class='hai-ai-doc-outline-item'
                  style={`padding-left:${0.65 + (item.level - 1) * 0.56}rem`}
                  onclick={() => scrollToHeading(item.id)}
                >
                  {showOutlineNumbering ? item.numberedTitle : item.text}
                </button>
              {/each}
            </nav>
          {:else}
            <p class='hai-ai-doc-outline-empty'>{uiM('markdown_no_outline')}</p>
          {/if}
        </aside>
      {/if}

      <section class='hai-ai-doc-reader'>
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          bind:this={editorScrollHost}
          class='hai-ai-doc-scroll'
          onclick={handleClick}
          onscroll={handleDocumentScroll}
          onkeyup={() => handleSelectionChange()}
        >
          {#if selectionToolbarVisible}
            <div
              class='hai-ai-doc-selection-layer'
              data-alignment={toolbarPosition.alignment}
              data-placement={toolbarPosition.placement}
              style={`top:${toolbarPosition.top}px; left:${toolbarPosition.left}px;`}
            >
              <div
                bind:this={selectionChromeEl}
                class='hai-ai-doc-selection-chrome'
                onmouseenter={clearPendingSelectionToolbarClose}
                onmouseleave={() => scheduleSelectionToolbarClose()}
              >
                <div
                  bind:this={selectionToolbarEl}
                  class='hai-ai-doc-selection-toolbar'
                  role='toolbar'
                  tabindex='-1'
                  onmousedown={event => event.preventDefault()}
                >
                  {#if onrewrite}
                    <button
                      type='button'
                      class={cn(
                        'hai-ai-doc-selection-chip',
                        (!directRewriteAction && activeSelectionMenu === 'rewrite')
                          ? 'hai-ai-doc-selection-chip--active'
                          : '',
                      )}
                      disabled={rewritePending}
                      onclick={(event) => {
                        if (directRewriteAction) {
                          void applyRewrite(directRewriteAction.id)
                          return
                        }

                        toggleSelectionMenu('rewrite', event)
                      }}
                    >
                      <svg viewBox='0 0 24 24' aria-hidden='true'>
                        <path
                          d='M12 3.25a.75.75 0 0 1 .72.55l1.06 3.62 3.63 1.06a.75.75 0 0 1 0 1.44l-3.63 1.06-1.06 3.63a.75.75 0 0 1-1.44 0l-1.06-3.63-3.63-1.06a.75.75 0 0 1 0-1.44l3.63-1.06 1.06-3.62a.75.75 0 0 1 .72-.55Zm6.5 11.5a.75.75 0 0 1 .72.55l.42 1.43 1.43.42a.75.75 0 0 1 0 1.44l-1.43.42-.42 1.43a.75.75 0 0 1-1.44 0l-.42-1.43-1.43-.42a.75.75 0 0 1 0-1.44l1.43-.42.42-1.43a.75.75 0 0 1 .72-.55Z'
                        ></path>
                      </svg>
                      <span>{uiM('markdown_rewrite')}</span>
                    </button>
                  {/if}

                  {#if richBlockFormattingEnabled}
                    {#if onrewrite}
                      <span class='hai-ai-doc-selection-divider'></span>
                    {/if}
                    <button
                      type='button'
                      class={cn(
                        'hai-ai-doc-selection-trigger',
                        activeSelectionMenu === 'block'
                          ? 'hai-ai-doc-selection-trigger--active'
                          : '',
                      )}
                      title={uiM('markdown_format_heading')}
                      onclick={event => toggleSelectionMenu('block', event)}
                    >
                      <span class='hai-ai-doc-selection-trigger-label'>
                        {activeBlockFormatOption.shortLabel}
                      </span>
                      <svg
                        viewBox='0 0 24 24'
                        aria-hidden='true'
                        class='hai-ai-doc-selection-trigger-chevron'
                      >
                        <path
                          d='M6.97 8.47a.75.75 0 0 1 1.06 0L12 12.44l3.97-3.97a.75.75 0 1 1 1.06 1.06l-4.5 4.5a.75.75 0 0 1-1.06 0l-4.5-4.5a.75.75 0 0 1 0-1.06Z'
                        ></path>
                      </svg>
                    </button>
                  {:else if legacyBlockFormattingEnabled}
                    {#if onrewrite}
                      <span class='hai-ai-doc-selection-divider'></span>
                    {/if}
                    <button
                      type='button'
                      class='hai-ai-doc-selection-btn'
                      title={uiM('markdown_format_heading')}
                      onclick={() => applyBlockFormat('heading')}
                    >
                      <svg viewBox='0 0 24 24' aria-hidden='true'>
                        <path
                          d='M5 5.25a.75.75 0 0 1 .75.75V11h6.5V6a.75.75 0 0 1 1.5 0v12a.75.75 0 0 1-1.5 0v-5.5h-6.5V18a.75.75 0 0 1-1.5 0V6A.75.75 0 0 1 5 5.25Zm11.25 2.5a.75.75 0 0 1 0 1.5h3a.75.75 0 0 1 0 1.5H18.5v8.5a.75.75 0 0 1-1.5 0v-8.5h-.75a.75.75 0 0 1 0-1.5h3Z'
                        ></path>
                      </svg>
                    </button>
                    <button
                      type='button'
                      class='hai-ai-doc-selection-btn'
                      title={uiM('markdown_format_bullet')}
                      onclick={() => applyBlockFormat('bullet')}
                    >
                      <svg viewBox='0 0 24 24' aria-hidden='true'>
                        <path
                          d='M6.25 7.25a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Zm14 0a.75.75 0 0 1-.75.75H8.75a.75.75 0 0 1 0-1.5H19.5a.75.75 0 0 1 .75.75Zm-14 5.5a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Zm14 0a.75.75 0 0 1-.75.75H8.75a.75.75 0 0 1 0-1.5H19.5a.75.75 0 0 1 .75.75Zm-14 5.5a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Zm14 0a.75.75 0 0 1-.75.75H8.75a.75.75 0 0 1 0-1.5H19.5a.75.75 0 0 1 .75.75Z'
                        ></path>
                      </svg>
                    </button>
                  {/if}

                  {#if onapplyalignment}
                    {#if anyBlockFormattingEnabled || onrewrite}
                      <span class='hai-ai-doc-selection-divider'></span>
                    {/if}
                    <button
                      type='button'
                      class={cn(
                        'hai-ai-doc-selection-trigger',
                        activeSelectionMenu === 'align'
                          ? 'hai-ai-doc-selection-trigger--active'
                          : '',
                      )}
                      title={uiM('markdown_align')}
                      onclick={event => toggleSelectionMenu('align', event)}
                    >
                      <svg viewBox='0 0 24 24' aria-hidden='true'>
                        {#if selectionFormatState.alignment === 'center'}
                          <path d='M5 6.25a.75.75 0 0 1 .75-.75h12.5a.75.75 0 0 1 0 1.5H5.75A.75.75 0 0 1 5 6.25Zm2.75 4.75a.75.75 0 0 1 .75-.75h7a.75.75 0 0 1 0 1.5h-7a.75.75 0 0 1-.75-.75Zm-2 4.75a.75.75 0 0 1 .75-.75h11a.75.75 0 0 1 0 1.5h-11a.75.75 0 0 1-.75-.75Z'></path>
                        {:else if selectionFormatState.alignment === 'right'}
                          <path d='M5.75 5.5a.75.75 0 0 0 0 1.5h12.5a.75.75 0 0 0 0-1.5H5.75Zm4 4.75a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5h-8.5Zm-4 4.75a.75.75 0 0 0 0 1.5h12.5a.75.75 0 0 0 0-1.5H5.75Z'></path>
                        {:else if selectionFormatState.alignment === 'justify'}
                          <path d='M5 6.25a.75.75 0 0 1 .75-.75h12.5a.75.75 0 0 1 0 1.5H5.75A.75.75 0 0 1 5 6.25Zm0 4.75a.75.75 0 0 1 .75-.75h12.5a.75.75 0 0 1 0 1.5H5.75A.75.75 0 0 1 5 11Zm0 4.75a.75.75 0 0 1 .75-.75h12.5a.75.75 0 0 1 0 1.5H5.75A.75.75 0 0 1 5 15.75Z'></path>
                        {:else}
                          <path d='M5 6.25a.75.75 0 0 1 .75-.75h12.5a.75.75 0 0 1 0 1.5H5.75A.75.75 0 0 1 5 6.25Zm0 4.75a.75.75 0 0 1 .75-.75h8.5a.75.75 0 0 1 0 1.5h-8.5A.75.75 0 0 1 5 11Zm0 4.75a.75.75 0 0 1 .75-.75h12.5a.75.75 0 0 1 0 1.5H5.75A.75.75 0 0 1 5 15.75Z'></path>
                        {/if}
                      </svg>
                      <svg
                        viewBox='0 0 24 24'
                        aria-hidden='true'
                        class='hai-ai-doc-selection-trigger-chevron'
                      >
                        <path
                          d='M6.97 8.47a.75.75 0 0 1 1.06 0L12 12.44l3.97-3.97a.75.75 0 1 1 1.06 1.06l-4.5 4.5a.75.75 0 0 1-1.06 0l-4.5-4.5a.75.75 0 0 1 0-1.06Z'
                        ></path>
                      </svg>
                    </button>
                  {/if}

                  {#if onapplyinlineformat || onapplylink || onapplycolor}
                    {#if anyBlockFormattingEnabled || onapplyalignment || onrewrite}
                      <span class='hai-ai-doc-selection-divider'></span>
                    {/if}
                  {/if}

                  {#if onapplyinlineformat}
                    <button
                      type='button'
                      class={cn(
                        'hai-ai-doc-selection-btn',
                        selectionFormatState.bold
                          ? 'hai-ai-doc-selection-btn--active'
                          : '',
                      )}
                      title={uiM('markdown_format_bold')}
                      onclick={() => applyInlineFormat('bold')}
                    >
                      <strong>B</strong>
                    </button>
                    <button
                      type='button'
                      class={cn(
                        'hai-ai-doc-selection-btn',
                        selectionFormatState.strike
                          ? 'hai-ai-doc-selection-btn--active'
                          : '',
                      )}
                      title={uiM('markdown_format_strike')}
                      onclick={() => applyInlineFormat('strike')}
                    >
                      <s>S</s>
                    </button>
                    <button
                      type='button'
                      class={cn(
                        'hai-ai-doc-selection-btn',
                        selectionFormatState.italic
                          ? 'hai-ai-doc-selection-btn--active'
                          : '',
                      )}
                      title={uiM('markdown_format_italic')}
                      onclick={() => applyInlineFormat('italic')}
                    >
                      <em>I</em>
                    </button>
                    <button
                      type='button'
                      class={cn(
                        'hai-ai-doc-selection-btn',
                        selectionFormatState.underline
                          ? 'hai-ai-doc-selection-btn--active'
                          : '',
                      )}
                      title={uiM('markdown_format_underline')}
                      onclick={() => applyInlineFormat('underline')}
                    >
                      <u>U</u>
                    </button>
                  {/if}

                  {#if onapplylink || onapplyinlineformat}
                    <button
                      bind:this={selectionLinkButtonEl}
                      type='button'
                      class={cn(
                        'hai-ai-doc-selection-btn',
                        selectionFormatState.linkHref
                          ? 'hai-ai-doc-selection-btn--active'
                          : '',
                        activeSelectionMenu === 'link'
                          ? 'hai-ai-doc-selection-btn--active'
                          : '',
                      )}
                      title={uiM('markdown_format_link')}
                      onclick={event =>
                        onapplylink
                          ? toggleSelectionMenu('link', event)
                          : applyInlineFormat('link')}
                    >
                      <svg
                        viewBox='0 0 24 24'
                        aria-hidden='true'
                        fill='none'
                        stroke='currentColor'
                        stroke-width='2'
                        stroke-linecap='round'
                        stroke-linejoin='round'
                      >
                        <path d='M9.5 14.5 14.5 9.5'></path>
                        <path d='M7.6 16.4 6.3 17.7a3 3 0 1 1-4.24-4.24l3-3a3 3 0 0 1 4.24 0'></path>
                        <path d='M16.4 7.6 17.7 6.3a3 3 0 1 1 4.24 4.24l-3 3a3 3 0 0 1-4.24 0'></path>
                      </svg>
                    </button>
                  {/if}

                  {#if onapplyinlineformat}
                    <button
                      type='button'
                      class={cn(
                        'hai-ai-doc-selection-btn',
                        selectionFormatState.code
                          ? 'hai-ai-doc-selection-btn--active'
                          : '',
                      )}
                      title={uiM('markdown_format_code')}
                      onclick={() => applyInlineFormat('code')}
                    >
                      &lt;/&gt;
                    </button>
                  {/if}

                  {#if onapplycolor}
                    <button
                      type='button'
                      class={cn(
                        'hai-ai-doc-selection-trigger',
                        activeSelectionMenu === 'color'
                          ? 'hai-ai-doc-selection-trigger--active'
                          : '',
                      )}
                      style={`--hai-ai-doc-current-color:${selectionFormatState.textColor ?? '#0f172a'};`}
                      title={uiM('markdown_text_color')}
                      onclick={event => toggleSelectionMenu('color', event)}
                    >
                      <span class='hai-ai-doc-selection-highlight-icon'>A</span>
                      <svg
                        viewBox='0 0 24 24'
                        aria-hidden='true'
                        class='hai-ai-doc-selection-trigger-chevron'
                      >
                        <path
                          d='M6.97 8.47a.75.75 0 0 1 1.06 0L12 12.44l3.97-3.97a.75.75 0 1 1 1.06 1.06l-4.5 4.5a.75.75 0 0 1-1.06 0l-4.5-4.5a.75.75 0 0 1 0-1.06Z'
                        ></path>
                      </svg>
                    </button>
                  {/if}

                  {#if oncopyselection || onannotation}
                    {#if onapplyinlineformat || onapplylink || onapplycolor}
                      <span class='hai-ai-doc-selection-divider'></span>
                    {/if}
                  {/if}

                  {#if oncopyselection}
                    <button
                      type='button'
                      class='hai-ai-doc-selection-btn hai-ai-doc-selection-btn-wide'
                      title={uiM('markdown_copy_selection')}
                      onclick={copySelection}
                    >
                      <svg viewBox='0 0 24 24' aria-hidden='true'>
                        <path
                          d='M8.75 4.25A2.75 2.75 0 0 0 6 7v8.25A2.75 2.75 0 0 0 8.75 18h7.5A2.75 2.75 0 0 0 19 15.25V7a2.75 2.75 0 0 0-2.75-2.75h-7.5Zm-4 3A2.75 2.75 0 0 1 7.5 4.5a.75.75 0 0 0 0-1.5A4.25 4.25 0 0 0 3.25 7.25v8.5A4.25 4.25 0 0 0 7.5 20a.75.75 0 0 0 0-1.5 2.75 2.75 0 0 1-2.75-2.75v-8.5Z'
                        ></path>
                      </svg>
                      <span>{uiM('markdown_copy_selection')}</span>
                    </button>
                  {/if}

                  {#if onannotation}
                    <button
                      type='button'
                      class='hai-ai-doc-selection-btn hai-ai-doc-selection-btn-wide'
                      title={uiM('markdown_annotation')}
                      onclick={annotateSelection}
                    >
                      <svg viewBox='0 0 24 24' aria-hidden='true'>
                        <path
                          d='M6.75 4.25A2.75 2.75 0 0 0 4 7v7.75A2.75 2.75 0 0 0 6.75 17.5h1.72l2.3 2.01a1.75 1.75 0 0 0 2.3 0l2.3-2.01h1.88A2.75 2.75 0 0 0 20 14.75V7a2.75 2.75 0 0 0-2.75-2.75H6.75Zm1.5 4a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5H9a.75.75 0 0 1-.75-.75Zm0 3.5A.75.75 0 0 1 9 11h4a.75.75 0 0 1 0 1.5H9a.75.75 0 0 1-.75-.75Z'
                        ></path>
                      </svg>
                    </button>
                  {/if}
                </div>

                {#if activeSelectionMenu === 'rewrite' && resolvedRewriteActions.length > 1}
                  <div
                    class='hai-ai-doc-rewrite-menu'
                    data-menu-alignment={selectionMenuAlignment}
                    role='menu'
                    tabindex='-1'
                    style={`--hai-ai-doc-selection-menu-left:${selectionMenuLeft}px;`}
                    onmousedown={handleSelectionPanelMouseDown}
                  >
                    {#each resolvedRewriteActions as action (action.id)}
                      <button
                        type='button'
                        class='hai-ai-doc-rewrite-menu-btn'
                        disabled={rewritePending}
                        onclick={() => applyRewrite(action.id)}
                      >
                        {action.label}
                      </button>
                    {/each}
                  </div>
                {:else if activeSelectionMenu === 'block' && richBlockFormattingEnabled}
                  <div
                    class='hai-ai-doc-selection-panel'
                    data-menu-alignment={selectionMenuAlignment}
                    role='menu'
                    tabindex='-1'
                    style={`--hai-ai-doc-selection-menu-left:${selectionMenuLeft}px;`}
                    onmousedown={handleSelectionPanelMouseDown}
                  >
                    {#each BLOCK_FORMAT_OPTIONS as option (option.value)}
                      <button
                        type='button'
                        class={cn(
                          'hai-ai-doc-selection-menu-btn',
                          selectionFormatState.blockFormat === option.value
                            ? 'hai-ai-doc-selection-menu-btn--active'
                            : '',
                        )}
                        onclick={() => applyBlockStyle(option.value)}
                      >
                        <span class='hai-ai-doc-selection-menu-label'>
                          <span class='hai-ai-doc-selection-menu-short'>
                            {option.shortLabel}
                          </span>
                          <span>{uiM(option.labelKey)}</span>
                        </span>
                        {#if selectionFormatState.blockFormat === option.value}
                          <span class='hai-ai-doc-selection-menu-check'>✓</span>
                        {/if}
                      </button>
                    {/each}
                  </div>
                {:else if activeSelectionMenu === 'align' && onapplyalignment}
                  <div
                    class='hai-ai-doc-selection-panel'
                    data-menu-alignment={selectionMenuAlignment}
                    role='menu'
                    tabindex='-1'
                    style={`--hai-ai-doc-selection-menu-left:${selectionMenuLeft}px;`}
                    onmousedown={handleSelectionPanelMouseDown}
                  >
                    {#each ALIGN_OPTIONS as option (option.value)}
                      <button
                        type='button'
                        class={cn(
                          'hai-ai-doc-selection-menu-btn',
                          selectionFormatState.alignment === option.value
                            ? 'hai-ai-doc-selection-menu-btn--active'
                            : '',
                        )}
                        onclick={() => applyAlignment(option.value)}
                      >
                        <span>{uiM(option.labelKey)}</span>
                        {#if selectionFormatState.alignment === option.value}
                          <span class='hai-ai-doc-selection-menu-check'>✓</span>
                        {/if}
                      </button>
                    {/each}
                  </div>
                {:else if activeSelectionMenu === 'link' && onapplylink}
                  <div
                    class='hai-ai-doc-selection-panel hai-ai-doc-selection-panel--link'
                    data-menu-alignment={selectionMenuAlignment}
                    role='dialog'
                    aria-label={uiM('markdown_link_dialog_label')}
                    tabindex='-1'
                    style={`--hai-ai-doc-selection-menu-left:${selectionMenuLeft}px;`}
                    onmousedown={handleSelectionPanelMouseDown}
                  >
                    <input
                      bind:this={linkInputEl}
                      class='hai-ai-doc-selection-input'
                      bind:value={linkDraft}
                      aria-label={uiM('markdown_link_input_label')}
                      placeholder={uiM('markdown_link_placeholder')}
                      onkeydown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          applyLink()
                        }
                      }}
                    />
                    <div class='hai-ai-doc-selection-panel-actions'>
                      <button
                        type='button'
                        class='hai-ai-doc-selection-panel-btn hai-ai-doc-selection-panel-btn--primary'
                        onclick={applyLink}
                      >
                        {uiM('markdown_link_apply')}
                      </button>
                      <button
                        type='button'
                        class='hai-ai-doc-selection-panel-btn'
                        disabled={!selectionFormatState.linkHref}
                        onclick={removeLink}
                      >
                        {uiM('markdown_link_remove')}
                      </button>
                    </div>
                  </div>
                {:else if activeSelectionMenu === 'color' && onapplycolor}
                  <div
                    class='hai-ai-doc-selection-panel hai-ai-doc-selection-panel--color'
                    data-menu-alignment={selectionMenuAlignment}
                    role='dialog'
                    aria-label={uiM('markdown_color_dialog_label')}
                    tabindex='-1'
                    style={`--hai-ai-doc-selection-menu-left:${selectionMenuLeft}px;`}
                    onmousedown={handleSelectionPanelMouseDown}
                  >
                    <div class='hai-ai-doc-color-group'>
                      <div class='hai-ai-doc-color-group-title'>
                        {uiM('markdown_text_color')}
                      </div>
                      <div class='hai-ai-doc-color-grid'>
                        {#each TEXT_COLOR_PRESETS as color, index (`${color}-${index}`)}
                          <button
                            type='button'
                            class={cn(
                              'hai-ai-doc-color-swatch',
                              selectionFormatState.textColor === color
                                ? 'hai-ai-doc-color-swatch--active'
                                : '',
                            )}
                            title={color}
                            onclick={() =>
                              applyColor({ target: 'text', value: color })}
                          >
                            <span style={`background:${color};`}></span>
                          </button>
                        {/each}
                      </div>
                    </div>
                    <div class='hai-ai-doc-color-group'>
                      <div class='hai-ai-doc-color-group-title'>
                        {uiM('markdown_background_color')}
                      </div>
                      <div class='hai-ai-doc-color-grid'>
                        {#each BACKGROUND_COLOR_OPTIONS as colorOption, index (resolveColorOptionValue(colorOption) ?? `empty-${index}`)}
                          <button
                            type='button'
                            class={cn(
                              'hai-ai-doc-color-swatch',
                              selectionFormatState.backgroundColor === resolveColorOptionValue(colorOption)
                                ? 'hai-ai-doc-color-swatch--active'
                                : '',
                            )}
                            data-empty={typeof colorOption === 'string'
                              ? undefined
                              : 'true'}
                            title={typeof colorOption === 'string'
                              ? colorOption
                              : uiM(colorOption.titleKey)}
                            onclick={() =>
                              applyColor({
                                target: 'background',
                                value: typeof colorOption === 'string'
                                  ? colorOption
                                  : colorOption.value,
                              })}
                          >
                            <span
                              style={typeof colorOption === 'string'
                                ? `background:${colorOption};`
                                : undefined}
                            ></span>
                          </button>
                        {/each}
                      </div>
                    </div>
                    <button
                      type='button'
                      class='hai-ai-doc-selection-panel-btn'
                      onclick={() => {
                        applyColor({ target: 'text', value: null })
                        applyColor({ target: 'background', value: null })
                      }}
                    >
                      {uiM('markdown_reset_default')}
                    </button>
                  </div>
                {/if}
              </div>
            </div>
          {/if}

          {#if hoveredLinkState}
            <div
              bind:this={hoveredLinkPopoverEl}
              class='hai-ai-doc-link-hover'
              data-placement={hoveredLinkState.placement}
              style={`top:${hoveredLinkState.top}px; left:${hoveredLinkState.left}px;`}
              onmouseenter={clearPendingHoveredLinkHide}
              onmouseleave={handlePreviewMouseLeave}
            >
              <button
                type='button'
                class='hai-ai-doc-link-hover-btn'
                title={uiM('markdown_link_open')}
                aria-label={uiM('markdown_link_open')}
                onmousedown={event => event.preventDefault()}
                onclick={openHoveredLink}
              >
                <svg viewBox='0 0 24 24' aria-hidden='true'>
                  <path
                    d='M13.75 5.75h4.5v4.5'
                    fill='none'
                    stroke='currentColor'
                    stroke-width='1.9'
                    stroke-linecap='round'
                    stroke-linejoin='round'
                  ></path>
                  <path
                    d='M18 6 11 13'
                    fill='none'
                    stroke='currentColor'
                    stroke-width='1.9'
                    stroke-linecap='round'
                    stroke-linejoin='round'
                  ></path>
                  <path
                    d='M10.25 7.75h-2.5A2.5 2.5 0 0 0 5.25 10.25v6A2.5 2.5 0 0 0 7.75 18.75h6a2.5 2.5 0 0 0 2.5-2.5v-2.5'
                    fill='none'
                    stroke='currentColor'
                    stroke-width='1.9'
                    stroke-linecap='round'
                    stroke-linejoin='round'
                  ></path>
                </svg>
              </button>
              <button
                type='button'
                class='hai-ai-doc-link-hover-btn'
                title={uiM('markdown_link_edit')}
                aria-label={uiM('markdown_link_edit')}
                onmousedown={event => event.preventDefault()}
                onclick={() => void editHoveredLink()}
              >
                <svg viewBox='0 0 24 24' aria-hidden='true'>
                  <path
                    d='M4.75 16.88V19.25h2.37l9.96-9.96-2.37-2.37-9.96 9.96Z'
                    fill='none'
                    stroke='currentColor'
                    stroke-width='1.9'
                    stroke-linecap='round'
                    stroke-linejoin='round'
                  ></path>
                  <path
                    d='M13.96 7.92 16.33 5.55a1.68 1.68 0 0 1 2.37 2.37l-2.37 2.37'
                    fill='none'
                    stroke='currentColor'
                    stroke-width='1.9'
                    stroke-linecap='round'
                    stroke-linejoin='round'
                  ></path>
                </svg>
              </button>
            </div>
          {/if}

          <article
            bind:this={previewHost}
            class={readerDocumentClass}
            contenteditable={editable}
            role='document'
            onmousemove={handlePreviewMouseMove}
            onmouseleave={handlePreviewMouseLeave}
            onmouseup={handlePreviewMouseUp}
            oninput={handlePreviewInput}
            onblur={handlePreviewBlur}
          >
            <!-- eslint-disable-next-line svelte/no-at-html-tags -- Markdown HTML 渲染 -->
            {@html html}
          </article>
        </div>
      </section>
    </div>
  </div>
</section>

<style>
  .hai-ai-doc-pane {
    --hai-ai-doc-selection-bg: color-mix(
      in srgb,
      oklch(var(--p, 0.62 0.22 264)) 28%,
      oklch(var(--b1, 1 0 0)) 72%
    );
    --hai-ai-doc-selection-fg: oklch(var(--bc, 0.22 0 0));
    display: flex;
    width: 100%;
    min-width: 0;
    min-height: 0;
    height: 100%;
    container-type: inline-size;
    container-name: ai-doc-editor;
    flex-direction: column;
    border: 1px solid oklch(var(--bc) / 0.08);
    border-radius: 1.5rem;
    background: linear-gradient(
      180deg,
      oklch(var(--b1)) 0%,
      oklch(var(--b1) / 0.98) 100%
    );
    overflow: hidden;
    box-shadow: 0 14px 40px oklch(var(--bc) / 0.06);
  }

  .hai-ai-doc-shell {
    display: flex;
    flex-direction: column;
    width: 100%;
    min-width: 0;
    min-height: 0;
    height: 100%;
  }

  .hai-ai-doc-topbar {
    padding: 1rem 1.5rem 0.5rem;
  }

  .hai-ai-doc-meta-bar,
  .hai-ai-doc-heading-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .hai-ai-doc-meta-bar {
    padding: 0.75rem 0;
    border-bottom: 1px solid oklch(var(--bc) / 0.08);
    justify-content: space-between;
  }

  .hai-ai-doc-toolbar-heading {
    display: flex;
    align-items: center;
    gap: 0.85rem;
    min-width: 0;
  }

  .hai-ai-doc-toolbar {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .hai-ai-doc-toolbar-icon,
  :global(.hai-ai-doc-toolbar-icon),
  .hai-ai-doc-toolbar-close,
  .hai-ai-doc-toolbar-pill,
  :global(.hai-ai-doc-toolbar-pill),
  .hai-ai-doc-toolbar-action {
    color: oklch(var(--bc));
    cursor: pointer;
    flex-shrink: 0;
  }

  .hai-ai-doc-toolbar-icon,
  :global(.hai-ai-doc-toolbar-icon),
  .hai-ai-doc-toolbar-close {
    width: 2.5rem;
    height: 2.5rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: oklch(var(--b1));
    border: 1px solid oklch(var(--bc) / 0.1);
    transition:
      border-color 0.15s ease,
      background-color 0.15s ease,
      color 0.15s ease,
      box-shadow 0.15s ease,
      transform 0.15s ease;
  }

  .hai-ai-doc-toolbar-icon,
  :global(.hai-ai-doc-toolbar-icon) {
    border-radius: 1rem;
  }

  .hai-ai-doc-toolbar-pill,
  :global(.hai-ai-doc-toolbar-pill) {
    min-height: 2.5rem;
    display: inline-flex;
    align-items: center;
    gap: 0.58rem;
    padding: 0 0.98rem;
    border-radius: 9999px;
    border: 1px solid color-mix(in srgb, oklch(var(--bc)) 8%, white 92%);
    background: color-mix(in srgb, white 88%, oklch(var(--b1)) 12%);
    transition:
      border-color 0.15s ease,
      background-color 0.15s ease,
      color 0.15s ease,
      box-shadow 0.15s ease,
      transform 0.15s ease;
    white-space: nowrap;
  }

  .hai-ai-doc-toolbar-pill span,
  :global(.hai-ai-doc-toolbar-pill span) {
    font-size: 0.95rem;
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  .hai-ai-doc-toolbar-close {
    border-radius: 1.05rem;
  }

  .hai-ai-doc-toolbar-icon svg,
  :global(.hai-ai-doc-toolbar-icon svg),
  .hai-ai-doc-toolbar-close svg,
  .hai-ai-doc-toolbar-pill svg,
  :global(.hai-ai-doc-toolbar-pill svg) {
    width: 1.08rem;
    height: 1.08rem;
    fill: currentColor;
  }

  .hai-ai-doc-toolbar-icon:not(:disabled):hover,
  :global(.hai-ai-doc-toolbar-icon:not(:disabled):hover),
  .hai-ai-doc-toolbar-pill:not(:disabled):hover,
  :global(.hai-ai-doc-toolbar-pill:not(:disabled):hover),
  .hai-ai-doc-toolbar-action:hover,
  .hai-ai-doc-toolbar-close:not(:disabled):hover,
  .hai-ai-doc-version-toggle:hover,
  .hai-ai-doc-outline-open:hover {
    border-color: oklch(var(--bc) / 0.16);
    background: color-mix(in srgb, white 70%, oklch(var(--b2)) 30%);
    color: oklch(var(--bc));
  }

  .hai-ai-doc-toolbar-icon:not(:disabled):hover,
  :global(.hai-ai-doc-toolbar-icon:not(:disabled):hover),
  .hai-ai-doc-toolbar-pill:not(:disabled):hover,
  :global(.hai-ai-doc-toolbar-pill:not(:disabled):hover),
  .hai-ai-doc-toolbar-close:not(:disabled):hover {
    transform: translateY(-1px);
    box-shadow: 0 12px 28px -22px oklch(var(--bc) / 0.36);
  }

  .hai-ai-doc-toolbar-icon:disabled,
  :global(.hai-ai-doc-toolbar-icon:disabled),
  .hai-ai-doc-toolbar-pill:disabled,
  :global(.hai-ai-doc-toolbar-pill:disabled),
  .hai-ai-doc-toolbar-close:disabled {
    opacity: 0.72;
    color: oklch(var(--bc) / 0.36);
    border-color: oklch(var(--bc) / 0.12);
    background: oklch(var(--b2) / 0.58);
    cursor: not-allowed;
    box-shadow: none;
  }

  .hai-ai-doc-toolbar-icon:disabled:hover,
  :global(.hai-ai-doc-toolbar-icon:disabled:hover),
  .hai-ai-doc-toolbar-pill:disabled:hover,
  :global(.hai-ai-doc-toolbar-pill:disabled:hover),
  .hai-ai-doc-toolbar-close:disabled:hover {
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
    filter: grayscale(0.18);
  }

  .hai-ai-doc-toolbar-action,
  .hai-ai-doc-version-toggle {
    border: 1px solid oklch(var(--bc) / 0.08);
    border-radius: 9999px;
    padding: 0.58rem 0.92rem;
    background: color-mix(in srgb, oklch(var(--b1)) 76%, white 24%);
    transition:
      border-color 0.15s ease,
      background-color 0.15s ease,
      color 0.15s ease;
    white-space: nowrap;
  }

  .hai-ai-doc-toolbar-pill--success {
    color: oklch(var(--su, 0.7 0.15 160));
    border-color: oklch(var(--su, 0.7 0.15 160) / 0.18);
    background: oklch(var(--su, 0.7 0.15 160) / 0.08);
  }

  .hai-ai-doc-toolbar-divider {
    width: 1px;
    height: 1.4rem;
    background: oklch(var(--bc) / 0.12);
  }

  .hai-ai-doc-title-block {
    min-width: 0;
  }

  .hai-ai-doc-title-block h2 {
    margin: 0;
    font-size: 1.4rem;
    line-height: 1.25;
  }

  .hai-ai-doc-layout {
    width: 100%;
    min-height: 0;
    min-width: 0;
    flex: 1 1 auto;
    display: flex;
    align-items: stretch;
    position: relative;
    overflow: hidden;
  }

  .hai-ai-doc-layout.hai-ai-doc-layout-collapsed {
    display: flex;
  }

  .hai-ai-doc-outline {
    width: 220px;
    flex: 0 0 220px;
    min-height: 0;
    display: grid;
    grid-template-rows: auto 1fr;
    position: relative;
    z-index: 0;
    padding: 0.5rem 0.625rem 1.25rem 1rem;
    border-right: 1px solid oklch(var(--bc) / 0.08);
    background: linear-gradient(
      180deg,
      oklch(var(--b2) / 0.42),
      transparent 100%
    );
  }

  .hai-ai-doc-outline-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.625rem;
    padding: 0.625rem 0.375rem 0.875rem 0;
  }

  .hai-ai-doc-outline-head strong {
    font-size: 0.94rem;
    color: oklch(var(--bc) / 0.84);
  }

  .hai-ai-doc-outline-toggle,
  .hai-ai-doc-outline-open {
    width: 2.5rem;
    height: 2.5rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid oklch(var(--bc) / 0.1);
    border-radius: 1rem;
    color: oklch(var(--bc) / 0.78);
    background: #fff;
    box-shadow: 0 12px 24px -22px oklch(var(--bc) / 0.28);
    transition:
      border-color 0.15s ease,
      background-color 0.15s ease,
      color 0.15s ease,
      box-shadow 0.15s ease,
      transform 0.15s ease;
    cursor: pointer;
    flex-shrink: 0;
  }

  .hai-ai-doc-outline-toggle svg,
  .hai-ai-doc-outline-open svg {
    width: 1.1rem;
    height: 1.1rem;
    fill: currentColor;
  }

  .hai-ai-doc-outline-list {
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .hai-ai-doc-outline-item {
    width: 100%;
    text-align: left;
    color: oklch(var(--bc) / 0.68);
    line-height: 1.5;
    padding-top: 0.3rem;
    padding-right: 0.25rem;
    padding-bottom: 0.3rem;
    border: none;
    border-radius: 0.75rem;
    background: transparent;
    transition: all 0.15s ease;
    cursor: pointer;
  }

  .hai-ai-doc-outline-item:hover {
    background: oklch(var(--bc) / 0.05);
    color: inherit;
  }

  .hai-ai-doc-outline-item.active {
    color: oklch(var(--p));
    font-weight: 700;
    background: oklch(var(--p) / 0.12);
  }

  .hai-ai-doc-outline-empty {
    margin: 0;
    padding: 0.25rem 0.25rem 0;
    color: oklch(var(--bc) / 0.58);
    font-size: 0.875rem;
  }

  .hai-ai-doc-reader {
    width: 100%;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    position: relative;
    z-index: 2;
    isolation: isolate;
    display: flex;
    flex-direction: column;
  }

  .hai-ai-doc-scroll {
    position: relative;
    width: 100%;
    min-width: 0;
    height: 100%;
    overflow: auto;
    padding: 0.5rem 0 1.75rem;
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
  }

  .hai-ai-doc-selection-layer {
    position: absolute;
    z-index: 60;
    display: block;
    width: fit-content;
    max-width: calc(100% - 2rem);
    transition:
      top 0.14s cubic-bezier(0.2, 0.85, 0.24, 1),
      left 0.14s cubic-bezier(0.2, 0.85, 0.24, 1);
    pointer-events: none;
  }

  .hai-ai-doc-selection-layer[data-alignment='left'] {
    justify-items: start;
  }

  .hai-ai-doc-selection-layer[data-alignment='right'] {
    justify-items: end;
  }

  .hai-ai-doc-selection-layer[data-alignment='center'] {
    justify-items: center;
  }

  .hai-ai-doc-selection-chrome {
    position: relative;
    display: inline-grid;
    width: fit-content;
    max-width: min(100%, calc(100vw - 2rem));
  }

  .hai-ai-doc-link-hover {
    position: absolute;
    z-index: 58;
    display: inline-flex;
    align-items: center;
    gap: 0.18rem;
    padding: 0.22rem;
    border-radius: 9999px;
    background: color-mix(in srgb, oklch(var(--b1, 1 0 0)) 94%, white 6%);
    border: 1px solid color-mix(in srgb, oklch(var(--bc, 0.22 0 0)) 12%, white 88%);
    box-shadow:
      0 20px 36px -26px rgb(15 23 42 / 0.26),
      0 10px 18px -16px rgb(15 23 42 / 0.18);
    pointer-events: auto;
    transition:
      top 0.14s cubic-bezier(0.2, 0.85, 0.24, 1),
      left 0.14s cubic-bezier(0.2, 0.85, 0.24, 1);
  }

  .hai-ai-doc-link-hover-btn {
    width: 2rem;
    height: 2rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 9999px;
    background: transparent;
    color: oklch(var(--bc) / 0.76);
    cursor: pointer;
    transition:
      background-color 0.14s ease,
      color 0.14s ease,
      transform 0.14s ease;
  }

  .hai-ai-doc-link-hover-btn:hover {
    background: oklch(var(--bc) / 0.06);
    color: oklch(var(--bc));
    transform: translateY(-1px);
  }

  .hai-ai-doc-link-hover-btn svg {
    width: 1rem;
    height: 1rem;
    fill: none;
    stroke: currentColor;
  }

  .hai-ai-doc-selection-toolbar {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    flex-wrap: nowrap;
    width: fit-content;
    max-width: calc(100% - 0.75rem);
    white-space: nowrap;
    padding: 0.38rem;
    border-radius: 1.2rem;
    background-color: rgb(255 255 255 / 0.96);
    background: color-mix(in srgb, oklch(var(--b1, 1 0 0)) 94%, white 6%);
    border: 1px solid rgb(148 163 184 / 0.34);
    border-color: color-mix(in srgb, oklch(var(--bc, 0.22 0 0)) 16%, white 84%);
    box-shadow:
      0 30px 60px -34px rgb(15 23 42 / 0.28),
      0 14px 26px -18px rgb(15 23 42 / 0.16),
      0 0 0 1px rgb(255 255 255 / 0.94) inset;
    pointer-events: auto;
    isolation: isolate;
    position: relative;
    z-index: 2;
  }

  .hai-ai-doc-selection-chip,
  .hai-ai-doc-selection-btn,
  .hai-ai-doc-selection-trigger {
    min-height: 2.25rem;
    border-radius: 0.9rem;
    transition:
      background-color 0.14s ease,
      border-color 0.14s ease,
      color 0.14s ease,
      transform 0.14s ease;
  }

  .hai-ai-doc-selection-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.48rem;
    flex-shrink: 0;
    padding: 0 0.88rem;
    border: 1px solid oklch(var(--p) / 0.16);
    background: oklch(var(--p) / 0.1);
    color: oklch(var(--bc) / 0.92);
    font-weight: 700;
    cursor: pointer;
  }

  .hai-ai-doc-selection-chip svg {
    width: 0.95rem;
    height: 0.95rem;
    fill: currentColor;
  }

  .hai-ai-doc-selection-chip--active {
    border-color: oklch(var(--p) / 0.28);
    background: oklch(var(--p) / 0.16);
    color: oklch(var(--bc));
  }

  .hai-ai-doc-selection-chip:not(:disabled):hover,
  .hai-ai-doc-selection-btn:hover,
  .hai-ai-doc-selection-trigger:hover,
  .hai-ai-doc-rewrite-menu-btn:hover {
    transform: translateY(-1px);
  }

  .hai-ai-doc-selection-chip:disabled {
    opacity: 0.55;
    cursor: default;
  }

  .hai-ai-doc-selection-btn {
    width: 2.25rem;
    min-width: 2.25rem;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 1px solid transparent;
    background: transparent;
    color: oklch(var(--bc) / 0.72);
    cursor: pointer;
  }

  .hai-ai-doc-selection-btn-wide {
    width: auto;
    min-width: 4.6rem;
    gap: 0.42rem;
    padding: 0 0.74rem;
  }

  .hai-ai-doc-selection-trigger {
    min-width: 3.4rem;
    display: inline-flex;
    align-items: center;
    gap: 0.34rem;
    padding: 0 0.66rem;
    border: 1px solid transparent;
    background: transparent;
    color: oklch(var(--bc) / 0.78);
    cursor: pointer;
  }

  .hai-ai-doc-selection-btn:hover,
  .hai-ai-doc-selection-trigger:hover {
    border-color: oklch(var(--bc) / 0.1);
    background: oklch(var(--bc) / 0.045);
    color: oklch(var(--bc));
  }

  .hai-ai-doc-selection-btn--active,
  .hai-ai-doc-selection-trigger--active {
    border-color: oklch(var(--p) / 0.22);
    background: oklch(var(--p) / 0.12);
    color: oklch(var(--bc));
  }

  .hai-ai-doc-selection-btn svg {
    width: 1rem;
    height: 1rem;
    fill: currentColor;
  }

  .hai-ai-doc-selection-trigger svg {
    width: 1rem;
    height: 1rem;
    fill: currentColor;
  }

  .hai-ai-doc-selection-trigger-label {
    font-weight: 600;
    line-height: 1;
  }

  .hai-ai-doc-selection-trigger-chevron {
    width: 0.8rem !important;
    height: 0.8rem !important;
    opacity: 0.72;
  }

  .hai-ai-doc-selection-divider {
    width: 1px;
    height: 1.45rem;
    margin: 0 0.2rem;
    background: oklch(var(--bc) / 0.12);
    flex-shrink: 0;
  }

  .hai-ai-doc-selection-highlight-icon {
    position: relative;
    font-weight: 700;
    color: var(--hai-ai-doc-current-color, currentColor);
  }

  .hai-ai-doc-selection-highlight-icon::after {
    content: '';
    position: absolute;
    left: -0.08rem;
    right: -0.08rem;
    bottom: -0.02rem;
    height: 0.36rem;
    border-radius: 9999px;
    background: color-mix(
      in srgb,
      var(--hai-ai-doc-current-color, oklch(var(--wa, 0.9 0.14 90))) 22%,
      white 78%
    );
    z-index: -1;
  }

  .hai-ai-doc-selection-panel,
  .hai-ai-doc-rewrite-menu {
    position: absolute;
    left: var(--hai-ai-doc-selection-menu-left, 0px);
    top: calc(100% + 0.45rem);
    display: grid;
    gap: 0.34rem;
    width: min(18rem, calc(100vw - 2rem));
    max-width: calc(100vw - 2rem);
    padding: 0.42rem;
    border-radius: 1rem;
    background-color: rgb(255 255 255 / 0.96);
    background: color-mix(in srgb, oklch(var(--b1, 1 0 0)) 94%, white 6%);
    border: 1px solid rgb(148 163 184 / 0.3);
    border-color: color-mix(in srgb, oklch(var(--bc, 0.22 0 0)) 14%, white 86%);
    box-shadow:
      0 24px 40px -28px rgb(15 23 42 / 0.25),
      0 10px 20px -16px rgb(15 23 42 / 0.14);
    pointer-events: auto;
    isolation: isolate;
    z-index: 3;
  }

  .hai-ai-doc-rewrite-menu {
    width: fit-content;
    max-width: min(22rem, calc(100vw - 2rem));
    grid-template-columns: repeat(auto-fit, minmax(7.2rem, 1fr));
  }

  .hai-ai-doc-selection-layer[data-placement='bottom'] .hai-ai-doc-selection-panel,
  .hai-ai-doc-selection-layer[data-placement='bottom'] .hai-ai-doc-rewrite-menu {
    top: auto;
    bottom: calc(100% + 0.45rem);
  }

  .hai-ai-doc-selection-panel[data-menu-alignment='left'],
  .hai-ai-doc-rewrite-menu[data-menu-alignment='left'] {
    transform: translateX(0);
  }

  .hai-ai-doc-selection-panel[data-menu-alignment='center'],
  .hai-ai-doc-rewrite-menu[data-menu-alignment='center'] {
    transform: translateX(-50%);
  }

  .hai-ai-doc-selection-panel[data-menu-alignment='right'],
  .hai-ai-doc-rewrite-menu[data-menu-alignment='right'] {
    transform: translateX(-100%);
  }

  .hai-ai-doc-selection-panel--link,
  .hai-ai-doc-selection-panel--color {
    width: min(16rem, calc(100vw - 2rem));
  }

  .hai-ai-doc-selection-menu-btn,
  .hai-ai-doc-selection-panel-btn,
  .hai-ai-doc-rewrite-menu-btn {
    min-height: 2rem;
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    width: 100%;
    padding: 0 0.72rem;
    border-radius: 0.8rem;
    border: 1px solid oklch(var(--bc) / 0.14);
    background: color-mix(in srgb, oklch(var(--b1)) 92%, white 8%);
    color: oklch(var(--bc) / 0.86);
    font-size: 0.82rem;
    line-height: 1;
    cursor: pointer;
    transition:
      background-color 0.14s ease,
      border-color 0.14s ease,
      color 0.14s ease,
      transform 0.14s ease;
  }

  .hai-ai-doc-selection-menu-btn--active,
  .hai-ai-doc-selection-panel-btn--primary {
    border-color: oklch(var(--p) / 0.28);
    background: oklch(var(--p) / 0.12);
    color: oklch(var(--bc));
  }

  .hai-ai-doc-selection-menu-btn:hover,
  .hai-ai-doc-selection-panel-btn:hover,
  .hai-ai-doc-rewrite-menu-btn:hover:not(:disabled) {
    border-color: oklch(var(--bc) / 0.22);
    background: color-mix(in srgb, oklch(var(--b2)) 68%, white 32%);
    color: oklch(var(--bc));
    transform: translateY(-1px);
  }

  .hai-ai-doc-selection-menu-label {
    display: inline-flex;
    align-items: center;
    gap: 0.62rem;
  }

  .hai-ai-doc-selection-menu-short {
    min-width: 2rem;
    color: oklch(var(--p) / 0.92);
    font-weight: 700;
  }

  .hai-ai-doc-selection-menu-check {
    color: oklch(var(--p) / 0.88);
    font-weight: 700;
  }

  .hai-ai-doc-selection-input {
    width: 100%;
    min-height: 2.25rem;
    padding: 0 0.78rem;
    border-radius: 0.85rem;
    border: 1px solid oklch(var(--bc) / 0.16);
    background: color-mix(in srgb, oklch(var(--b1)) 94%, white 6%);
    color: oklch(var(--bc));
    font-size: 0.84rem;
    outline: none;
  }

  .hai-ai-doc-selection-input:focus {
    border-color: oklch(var(--p) / 0.34);
    box-shadow: 0 0 0 3px oklch(var(--p) / 0.12);
  }

  .hai-ai-doc-selection-panel-actions {
    display: flex;
    gap: 0.4rem;
  }

  .hai-ai-doc-selection-panel-actions .hai-ai-doc-selection-panel-btn {
    flex: 1 1 0;
  }

  .hai-ai-doc-selection-panel-btn:disabled,
  .hai-ai-doc-rewrite-menu-btn:disabled {
    opacity: 0.55;
    cursor: default;
  }

  .hai-ai-doc-color-group {
    display: grid;
    gap: 0.42rem;
  }

  .hai-ai-doc-color-group-title {
    font-size: 0.78rem;
    font-weight: 600;
    color: oklch(var(--bc) / 0.68);
  }

  .hai-ai-doc-color-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.42rem;
  }

  .hai-ai-doc-color-swatch {
    width: 100%;
    aspect-ratio: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.18rem;
    border-radius: 0.7rem;
    border: 1px solid oklch(var(--bc) / 0.12);
    background: color-mix(in srgb, oklch(var(--b1)) 92%, white 8%);
    cursor: pointer;
    transition:
      transform 0.14s ease,
      border-color 0.14s ease,
      box-shadow 0.14s ease;
  }

  .hai-ai-doc-color-swatch:hover {
    transform: translateY(-1px);
    border-color: oklch(var(--bc) / 0.2);
  }

  .hai-ai-doc-color-swatch--active {
    border-color: oklch(var(--p) / 0.34);
    box-shadow: 0 0 0 3px oklch(var(--p) / 0.12);
  }

  .hai-ai-doc-color-swatch span {
    width: 100%;
    height: 100%;
    border-radius: 0.5rem;
    border: 1px solid rgb(15 23 42 / 0.08);
  }

  .hai-ai-doc-color-swatch[data-empty='true'] span {
    position: relative;
    border-color: oklch(var(--bc) / 0.18);
    background:
      linear-gradient(
        135deg,
        transparent calc(50% - 0.75px),
        oklch(var(--bc) / 0.34) calc(50% - 0.75px),
        oklch(var(--bc) / 0.34) calc(50% + 0.75px),
        transparent calc(50% + 0.75px)
      ),
      color-mix(in srgb, oklch(var(--b1)) 96%, white 4%);
  }

  .hai-ai-doc-rewrite-menu-btn {
    justify-content: center;
  }

  .hai-markdown {
    line-height: 1.9;
    color: inherit;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }

  .hai-markdown-document {
    width: 100%;
    min-width: 0;
    max-width: 52.5rem;
    margin: 0 auto;
    padding: 1.25rem 2rem 6rem;
    outline: none;
  }

  .hai-markdown-document.hai-markdown-code-only {
    max-width: none !important;
    width: 100% !important;
    min-width: 0;
    margin: 0 !important;
    height: 100%;
    min-height: 100%;
    padding: 0.5rem 0.75rem 0.75rem;
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    box-sizing: border-box;
  }

  :global(.hai-markdown-document ::selection) {
    background: var(--hai-ai-doc-selection-bg, rgb(59 130 246 / 0.22));
    color: var(--hai-ai-doc-selection-fg, inherit);
  }

  :global(.hai-markdown-document ::-moz-selection) {
    background: var(--hai-ai-doc-selection-bg, rgb(59 130 246 / 0.22));
    color: var(--hai-ai-doc-selection-fg, inherit);
  }

  .hai-markdown-document.hai-markdown-editable {
    min-height: 100%;
  }

  .hai-markdown :global(h1),
  .hai-markdown :global(h2),
  .hai-markdown :global(h3),
  .hai-markdown :global(h4),
  .hai-markdown :global(h5),
  .hai-markdown :global(h6) {
    font-weight: 700;
    line-height: 1.25;
    margin-top: 1.6em;
    margin-bottom: 0.75em;
    letter-spacing: -0.02em;
    color: oklch(var(--bc));
    scroll-margin-top: 1rem;
  }

  .hai-markdown :global(h1) {
    font-size: 2.2rem;
    padding-bottom: 0.45em;
    border-bottom: 1px solid oklch(var(--bc) / 0.12);
  }

  .hai-markdown :global(h2) {
    font-size: 1.48rem;
  }

  .hai-markdown :global(h3) {
    font-size: 1.18rem;
  }

  .hai-markdown :global(h4) {
    font-size: 1.02rem;
  }

  .hai-markdown :global(h5) {
    font-size: 0.95rem;
  }

  .hai-markdown :global(h6) {
    font-size: 0.88rem;
    color: oklch(var(--bc) / 0.7);
  }

  .hai-markdown :global(:first-child) {
    margin-top: 0;
  }

  .hai-markdown :global(p) {
    margin-top: 0;
    margin-bottom: 1em;
  }

  .hai-markdown :global(.hai-md-align-block) {
    width: 100%;
  }

  .hai-markdown :global(a) {
    color: oklch(var(--p));
    text-decoration: none;
    font-weight: 500;
  }

  .hai-markdown-editable :global(a[href]) {
    cursor: pointer;
  }

  .hai-markdown :global(a:hover) {
    text-decoration: underline;
  }

  .hai-markdown :global(strong) {
    font-weight: 700;
  }

  .hai-markdown :global(em) {
    font-style: italic;
  }

  .hai-markdown :global(del) {
    text-decoration: line-through;
    color: oklch(var(--bc) / 0.55);
  }

  .hai-markdown :global(u) {
    text-decoration-thickness: 0.08em;
    text-underline-offset: 0.14em;
  }

  .hai-markdown :global(mark) {
    padding: 0 0.12em;
    border-radius: 0.25rem;
    background: oklch(var(--wa, 0.9 0.14 90) / 0.34);
    color: inherit;
  }

  .hai-markdown :global(.hai-md-inline-style) {
    border-radius: 0.2rem;
    padding: 0 0.04em;
  }

  .hai-markdown :global(:not(pre) > code) {
    padding: 0.2em 0.4em;
    margin: 0 0.1em;
    font-size: 0.875em;
    font-family:
      ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas,
      'Liberation Mono', monospace;
    background: oklch(var(--bc) / 0.08);
    border-radius: 0.375rem;
    word-break: break-word;
  }

  .hai-markdown :global(.hai-md-code-block) {
    position: relative;
    margin: 1em 0;
    border-radius: 0.95rem;
    overflow: hidden;
    background: oklch(var(--n));
    color: oklch(var(--nc));
    box-shadow: 0 10px 26px oklch(var(--bc) / 0.08);
  }

  .hai-markdown :global(.hai-md-code-header) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.65rem 1rem;
    min-height: 2.5rem;
    line-height: 1.2;
    background: oklch(var(--n) / 0.94);
    border-bottom: 1px solid oklch(var(--nc) / 0.1);
  }

  .hai-markdown :global(.hai-md-code-header-main) {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.55rem;
  }

  .hai-markdown :global(.hai-md-code-actions) {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .hai-markdown :global(.hai-md-code-lang) {
    font-size: 0.75rem;
    font-weight: 600;
    line-height: 1;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: oklch(var(--nc) / 0.6);
    user-select: none;
  }

  .hai-markdown :global(.hai-md-code-view-switch) {
    display: inline-flex;
    align-items: center;
    gap: 0.16rem;
    padding: 0.15rem;
    border-radius: 9999px;
    border: 1px solid oklch(var(--nc) / 0.16);
    background: oklch(var(--nc) / 0.08);
    flex-shrink: 0;
  }

  .hai-markdown :global(.hai-md-code-view-btn) {
    min-height: 1.7rem;
    padding: 0 0.72rem;
    border: none;
    border-radius: 9999px;
    background: transparent;
    color: oklch(var(--nc) / 0.72);
    font-size: 0.86rem;
    font-weight: 600;
    line-height: 1;
    cursor: pointer;
    transition:
      background-color 0.15s ease,
      color 0.15s ease;
  }

  .hai-markdown :global(.hai-md-code-view-btn[aria-pressed='true']) {
    background: oklch(var(--nc) / 0.2);
    color: oklch(var(--nc));
  }

  .hai-markdown :global(.hai-md-code-preview-hint) {
    font-size: 0.75rem;
    line-height: 1;
    color: oklch(var(--nc) / 0.48);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .hai-markdown :global(.hai-md-code-lang-empty) {
    opacity: 0.7;
  }

  .hai-markdown :global(.hai-md-code-action) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border: none;
    border-radius: 0.45rem;
    background: transparent;
    color: oklch(var(--nc) / 0.55);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .hai-markdown :global(.hai-md-code-action:hover) {
    background: oklch(var(--nc) / 0.1);
    color: oklch(var(--nc) / 0.92);
  }

  .hai-markdown :global(.hai-md-copy-btn.hai-md-copied) {
    color: oklch(var(--su, 0.7 0.15 160));
  }

  .hai-markdown :global(.hai-md-code-block pre) {
    margin: 0;
    padding: 1rem;
    overflow-x: auto;
    background: transparent;
  }

  .hai-markdown :global(.hai-md-code-block code) {
    font-family:
      ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas,
      'Liberation Mono', monospace;
    font-size: 0.875rem;
    line-height: 1.45;
    tab-size: 2;

    /* Shiki CSS Variables 主题（由 highlight.ts 的 createCssVariablesTheme 引用） */
    --hai-hl-foreground: oklch(var(--nc));
    --hai-hl-background: transparent;
    --hai-hl-token-keyword: oklch(0.7 0.15 280);
    --hai-hl-token-string: oklch(0.75 0.12 150);
    --hai-hl-token-string-expression: oklch(0.75 0.12 150);
    --hai-hl-token-constant: oklch(0.78 0.12 70);
    --hai-hl-token-comment: oklch(var(--nc) / 0.45);
    --hai-hl-token-function: oklch(0.72 0.14 220);
    --hai-hl-token-parameter: oklch(0.72 0.12 35);
    --hai-hl-token-punctuation: oklch(var(--nc) / 0.7);
    --hai-hl-token-link: oklch(0.7 0.15 280);
  }

  .hai-markdown :global(.hai-md-code-preview-slot) {
    border-top: 1px solid oklch(var(--nc) / 0.08);
    background: oklch(var(--b1));
  }

  .hai-markdown :global(.hai-md-code-block[data-code-view='code'] .hai-md-code-preview-slot) {
    display: none;
  }

  .hai-markdown :global(.hai-md-code-block[data-code-view='preview'] pre) {
    display: none;
  }

  .hai-markdown :global(.hai-md-code-block[data-code-view='preview'] .hai-md-code-preview-slot) {
    display: block;
  }

  .hai-markdown-code-only :global(.hai-md-code-block) {
    width: 100% !important;
    max-width: none !important;
    min-width: 0;
    margin: 0;
    height: auto;
    min-height: 0;
    flex: 1 1 auto;
    display: flex !important;
    align-self: stretch;
    align-items: stretch;
    flex-direction: column;
    overflow: hidden;
  }

  .hai-markdown-code-only :global(.hai-md-code-header),
  .hai-markdown-code-only :global(.hai-md-code-block pre),
  .hai-markdown-code-only :global(.hai-md-code-preview-slot) {
    width: 100%;
    min-width: 0;
    min-height: 0;
    box-sizing: border-box;
  }

  /* 代码/预览切换时统一固定 header 高度，避免视觉抖动。 */
  .hai-markdown-code-only :global(.hai-md-code-header) {
    flex: 0 0 3.1rem;
    height: 3.1rem;
    min-height: 3.1rem;
    padding: 0 1rem;
    align-items: center;
  }

  .hai-markdown-code-only :global(.hai-md-code-block pre),
  .hai-markdown-code-only :global(.hai-md-code-preview-slot) {
    flex: 1 1 auto;
    height: auto;
    min-height: 0;
  }

  .hai-markdown-code-only :global(.hai-md-code-block pre) {
    overflow: auto;
  }

  .hai-markdown-code-only :global(.hai-md-code-preview-slot) {
    background: oklch(var(--n));
    color: oklch(var(--nc));
  }

  .hai-markdown-code-only :global(.hai-md-code-block[data-code-view='preview']) {
    flex: 1 1 auto;
  }

  .hai-markdown-code-only :global(.hai-md-code-block[data-code-view='preview'] .hai-md-code-preview-slot) {
    flex: 1 1 auto;
    display: flex;
  }

  .hai-markdown :global(blockquote) {
    margin: 1em 0;
    padding: 0.65em 1.1em;
    border-left: 4px solid oklch(var(--p) / 0.4);
    background: oklch(var(--bc) / 0.03);
    border-radius: 0 0.5rem 0.5rem 0;
    color: oklch(var(--bc) / 0.85);
  }

  .hai-markdown :global(blockquote p:last-child) {
    margin-bottom: 0;
  }

  .hai-markdown :global(ul),
  .hai-markdown :global(ol) {
    margin: 0.5em 0 1em;
    padding-left: 2em;
  }

  .hai-markdown :global(ul) {
    list-style-type: disc;
  }

  .hai-markdown :global(ol) {
    list-style-type: decimal;
  }

  .hai-markdown :global(li) {
    margin: 0.25em 0;
    line-height: 1.7;
  }

  .hai-markdown :global(li > ul),
  .hai-markdown :global(li > ol) {
    margin: 0.25em 0;
  }

  .hai-markdown :global(ul ul) {
    list-style-type: circle;
  }

  .hai-markdown :global(ul ul ul) {
    list-style-type: square;
  }

  .hai-markdown :global(ul:has(> li > input[type='checkbox'])) {
    list-style: none;
    padding-left: 0;
  }

  .hai-markdown :global(li > input[type='checkbox']) {
    margin-right: 0.5em;
    vertical-align: middle;
    accent-color: oklch(var(--p));
  }

  .hai-markdown :global(.hai-md-table-wrap) {
    margin: 1em 0;
    overflow-x: auto;
    border-radius: 0.5rem;
    border: 1px solid oklch(var(--bc) / 0.1);
  }

  .hai-markdown :global(table) {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9em;
  }

  .hai-markdown :global(thead) {
    background: oklch(var(--bc) / 0.04);
  }

  .hai-markdown :global(th) {
    font-weight: 600;
    text-align: left;
    padding: 0.75rem 1rem;
    border-bottom: 2px solid oklch(var(--bc) / 0.12);
  }

  .hai-markdown :global(td) {
    padding: 0.625rem 1rem;
    border-bottom: 1px solid oklch(var(--bc) / 0.06);
  }

  .hai-markdown :global(tr:last-child td) {
    border-bottom: none;
  }

  .hai-markdown :global(tbody tr:hover) {
    background: oklch(var(--bc) / 0.02);
  }

  .hai-markdown :global(hr) {
    height: 0;
    margin: 2em 0;
    border: 0;
    border-top: 1px solid oklch(var(--bc) / 0.12);
  }

  .hai-markdown :global(.hai-md-img) {
    max-width: 100%;
    height: auto;
    border-radius: 0.5rem;
    margin: 1em 0;
  }

  .hai-markdown :global(kbd) {
    padding: 0.15em 0.4em;
    font-size: 0.85em;
    font-family: ui-monospace, SFMono-Regular, monospace;
    background: oklch(var(--bc) / 0.06);
    border: 1px solid oklch(var(--bc) / 0.15);
    border-radius: 0.25rem;
    box-shadow: inset 0 -1px 0 oklch(var(--bc) / 0.1);
  }

  :global(.hai-md-preview-card) {
    margin: 0;
    padding: 1rem;
    background: oklch(var(--b1));
    color: oklch(var(--bc));
  }

  .hai-markdown-code-only :global(.hai-md-code-block[data-code-view='preview'] .hai-md-preview-card) {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
    padding: 0.95rem 1rem;
    background: oklch(var(--n));
    color: oklch(var(--nc));
  }

  .hai-markdown-code-only :global(.hai-md-code-block[data-code-view='preview'] .hai-md-preview-head),
  .hai-markdown-code-only :global(.hai-md-code-block[data-code-view='preview'] .hai-md-preview-desc) {
    display: none;
  }

  :global(.hai-md-preview-head) {
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: oklch(var(--bc) / 0.7);
  }

  :global(.hai-md-preview-desc) {
    margin: 0.5rem 0 0;
    font-size: 0.875rem;
    color: oklch(var(--bc) / 0.7);
  }

  :global(.hai-md-preview-empty) {
    min-height: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.62rem;
  }

  :global(.hai-md-preview-empty-title) {
    margin: 0;
    font-size: 0.9rem;
    font-weight: 700;
    letter-spacing: 0.01em;
    color: oklch(var(--bc) / 0.85);
  }

  :global(.hai-md-preview-empty-text) {
    margin: 0;
    font-size: 0.84rem;
    line-height: 1.58;
    white-space: pre-wrap;
    color: oklch(var(--bc) / 0.74);
  }

  .hai-markdown-code-only :global(.hai-md-preview-empty-title) {
    color: oklch(var(--nc) / 0.88);
  }

  .hai-markdown-code-only :global(.hai-md-preview-empty-text) {
    color: oklch(var(--nc) / 0.72);
  }

  :global(.hai-md-preview-card pre) {
    margin: 0.85rem 0 0;
    padding: 0.85rem 1rem;
    overflow-x: auto;
    border-radius: 0.85rem;
    background: oklch(var(--b2));
    font-size: 0.85rem;
  }

  :global(.hai-md-preview-card.hai-md-preview-error pre) {
    color: oklch(var(--er));
  }

  :global(.hai-md-preview-frame) {
    display: block;
    width: 100%;
    min-height: 280px;
    margin-top: 0.85rem;
    border: 1px solid oklch(var(--bc) / 0.1);
    border-radius: 1rem;
    background: white;
  }

  .hai-markdown-code-only :global(.hai-md-code-block[data-code-view='preview'] .hai-md-preview-frame) {
    flex: 1 1 auto;
    height: 100%;
    min-height: 0;
    margin-top: 0;
    border: none;
    border-radius: 0;
  }

  :global(.hai-md-preview-loading) {
    width: 100%;
    height: 4px;
    margin-top: 0.5rem;
    border-radius: 9999px;
    background: linear-gradient(
      90deg,
      oklch(var(--p) / 0.15) 0%,
      oklch(var(--p) / 0.5) 50%,
      oklch(var(--p) / 0.15) 100%
    );
    background-size: 220px 100%;
    animation: hai-md-loading 1.2s linear infinite;
  }

  :global(.hai-md-preview-rendered > :first-child) {
    margin-top: 0.85rem;
  }

  @keyframes hai-md-loading {
    from {
      background-position: 220px 0;
    }

    to {
      background-position: -220px 0;
    }
  }

  @container ai-doc-editor (max-width: 800px) {
    .hai-ai-doc-layout {
      display: flex;
      min-height: 0;
    }

    .hai-ai-doc-outline {
      position: absolute;
      top: 0.65rem;
      left: 0.65rem;
      bottom: 0.85rem;
      width: min(220px, calc(100% - 1.3rem));
      max-width: 220px;
      z-index: 14;
      padding: 0.5rem 0.625rem 0.9rem 0.75rem;
      border: 1px solid oklch(var(--bc) / 0.12);
      border-radius: 0.95rem;
      background:
        linear-gradient(180deg, oklch(var(--b2) / 0.84), oklch(var(--b1) / 0.92));
      box-shadow: 0 20px 40px -28px oklch(var(--bc) / 0.35);
      backdrop-filter: blur(8px);
    }
  }

  @media (max-width: 960px) {
    .hai-ai-doc-topbar {
      padding-left: 1rem;
      padding-right: 1rem;
    }
  }

  @media (max-width: 640px) {
    .hai-ai-doc-meta-bar {
      align-items: flex-start;
      flex-direction: column;
    }

    .hai-ai-doc-toolbar,
    .hai-ai-doc-toolbar-heading {
      width: 100%;
    }

    .hai-ai-doc-toolbar {
      justify-content: flex-start;
    }

    .hai-ai-doc-scroll {
      padding-bottom: 1rem;
    }

    .hai-markdown-document {
      padding-left: 1.125rem;
      padding-right: 1.125rem;
    }

    .hai-ai-doc-selection-toolbar {
      max-width: calc(100vw - 2rem);
      overflow: hidden;
    }
  }
</style>
