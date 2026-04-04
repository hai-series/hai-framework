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
    MarkdownCodeBlockItem,
    MarkdownCodeRunRequest,
    MarkdownCodeRunResult,
    MarkdownInlineFormatKind,
    MarkdownRewriteAction,
  } from './document-types.js'
  import { uiM } from '../../../messages.js'
  import { cn } from '../../../utils.js'
  import AiDocumentDownloadMenu from './AiDocumentDownloadMenu.svelte'
  import { resolveDocumentMarkdownContent } from './document-download.js'
  import { renderMarkdownDocument } from './document-parse.js'
  import { parseMarkdown } from './markdown-parse.js'

  interface SelectionToolbarPosition {
    /** 选区工具条相对滚动容器的 top 坐标。 */
    top: number
    /** 选区工具条中心点相对滚动容器的 left 坐标。 */
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
    // 是否启用语法高亮。
    enableHighlight = true,
    // 是否把换行渲染为 <br>。
    breaks = true,
    // 是否显示左侧目录。
    showOutline = true,
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
    // 行内格式动作回调。
    onapplyinlineformat,
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
  // 改写菜单显示开关。
  let rewriteMenuOpen = $state(false)
  // 文档头部标题只有在正文首个标题滚出可视区后才显示，避免双标题并排出现。
  let showPinnedTitle = $state(Boolean(title))
  // 选区工具条在滚动容器中的定位坐标。
  let toolbarPosition = $state<SelectionToolbarPosition>({
    top: 0,
    left: 0,
    placement: 'top',
    alignment: 'center',
  })
  // documentCopied 只负责顶部复制按钮的瞬时反馈，不和正文内容状态混用。
  let documentCopied = $state(false)
  // copyFeedbackTimer 用来保证连续点击复制时，成功态能按最后一次操作重新计时。
  let copyFeedbackTimer: ReturnType<typeof window.setTimeout> | undefined = $state()
  // 每个代码块的运行状态和预览结果，key 为 codeBlockId。
  let codePreviews = $state<Record<string, CodePreviewState>>({})

  // code 类型产物通常只有裸代码文本，这里统一包成 fenced block 进入同一条渲染链路。
  const documentContent = $derived(
    resolveDocumentMarkdownContent(content, sourceKind, codeLanguage),
  )
  // 渲染结果同时提供 HTML、目录和代码块元数据，供顶部目录与代码预览共用。
  const renderResult = $derived(
    renderMarkdownDocument(documentContent, {
      enableHighlight,
      showCopyButton,
      showRunButton,
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
  // selectionToolsEnabled 统一判断选区工具条是否值得出现，避免正文只读展示时还露出空浮层。
  const selectionToolsEnabled = $derived(
    [
      onrewrite,
      onapplyblockformat,
      onapplyinlineformat,
      oncopyselection,
      onannotation,
    ].some(Boolean),
  )
  // readerDocumentClass 只负责正文文章区域，不和外层容器类名混用。
  const readerDocumentClass = $derived(
    cn(
      'hai-markdown',
      'hai-markdown-document',
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
    closeSelectionToolbar()
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
    return /<!doctype html>|<html[\s>]|<body[\s>]|<div[\s>]|<main[\s>]/i.test(
      code,
    )
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
            error: uiM('markdown_run_unavailable'),
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

  async function handleClick(event: MouseEvent): Promise<void> {
    const target = event.target as HTMLElement
    const copyButton = target.closest(
      '[data-copy-code]',
    ) as HTMLButtonElement | null
    if (copyButton) {
      await copyCodeFromButton(copyButton)
      return
    }

    const runButton = target.closest(
      '[data-run-code]',
    ) as HTMLButtonElement | null
    const codeBlockId = runButton?.dataset.codeBlockId
    if (runButton && codeBlockId) {
      await runCodeBlock(codeBlockId)
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
      host.innerHTML = `<div class="hai-md-preview-card"><div class="hai-md-preview-head">${escapePreviewText(uiM('markdown_running'))}</div><div class="hai-md-preview-loading"></div></div>`
      return
    }

    if (preview.status === 'error') {
      host.innerHTML = `<div class="hai-md-preview-card hai-md-preview-error"><div class="hai-md-preview-head">${escapePreviewText(uiM('markdown_run_failed'))}</div><pre>${escapePreviewText(preview.error ?? uiM('markdown_run_failed'))}</pre></div>`
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
        showRunButton: false,
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

  function closeSelectionToolbar(): void {
    selectionToolbarVisible = false
    rewriteMenuOpen = false
    selectedText = ''
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

    const firstHeading = previewHost.querySelector<HTMLElement>(
      '[data-heading-id]',
    )
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
    if (selectionToolbarVisible) {
      closeSelectionToolbar()
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
  function handleSelectionChange(): void {
    if (
      !selectionToolsEnabled
      || typeof window === 'undefined'
      || !previewHost
      || !editorScrollHost
    ) {
      return
    }

    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      closeSelectionToolbar()
      return
    }

    const anchorNode = selection.anchorNode
    const focusNode = selection.focusNode
    if (
      !anchorNode
      || !focusNode
      || !previewHost.contains(anchorNode)
      || !previewHost.contains(focusNode)
    ) {
      closeSelectionToolbar()
      return
    }

    const text = selection.toString().trim()
    if (!text) {
      closeSelectionToolbar()
      return
    }

    const range = selection.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    const hostRect = editorScrollHost.getBoundingClientRect()
    // 浮层尺寸在首次渲染前拿不到精确高度，这里用稳定的经验值决定上下避让方向，避免直接盖住选中文本。
    const estimatedToolbarHeight = rewriteMenuOpen ? 132 : 56
    const offset = 12
    const topSpace = rect.top - hostRect.top
    const bottomSpace = hostRect.bottom - rect.bottom
    const placement
      = topSpace >= estimatedToolbarHeight + offset || bottomSpace < estimatedToolbarHeight
        ? 'top'
        : 'bottom'
    const center = rect.left - hostRect.left + rect.width / 2
    const horizontalPadding = 16
    const estimatedToolbarHalfWidth = Math.min(
      272,
      Math.max(
        132,
        (editorScrollHost.clientWidth - horizontalPadding * 2) / 2,
      ),
    )
    const minCenter = horizontalPadding + estimatedToolbarHalfWidth
    const maxCenter = editorScrollHost.clientWidth - minCenter
    const alignment
      = center <= minCenter
        ? 'left'
        : center >= maxCenter
        ? 'right'
        : 'center'
    const toolbarLeft
      = alignment === 'left'
        ? horizontalPadding
        : alignment === 'right'
        ? editorScrollHost.clientWidth - horizontalPadding
        : center
    const toolbarTop
      = placement === 'top'
        ? editorScrollHost.scrollTop + rect.top - hostRect.top - estimatedToolbarHeight - offset
        : editorScrollHost.scrollTop + rect.bottom - hostRect.top + offset

    selectedText = text
    selectionToolbarVisible = true
    rewriteMenuOpen = false
    toolbarPosition = {
      top: Math.max(12, toolbarTop),
      left: Math.max(horizontalPadding, toolbarLeft),
      placement,
      alignment,
    }
  }

  async function applyRewrite(actionId: string): Promise<void> {
    if (!onrewrite || !selectedText.trim()) {
      return
    }

    rewriteMenuOpen = false
    await onrewrite({
      actionId,
      selectedText,
      content,
      title: title || undefined,
    })
  }

  function applyBlockFormat(kind: MarkdownBlockFormatKind): void {
    onapplyblockformat?.(kind)
    closeSelectionToolbar()
  }

  function applyInlineFormat(kind: MarkdownInlineFormatKind): void {
    onapplyinlineformat?.(kind)
    closeSelectionToolbar()
  }

  async function copySelection(): Promise<void> {
    await oncopyselection?.()
    closeSelectionToolbar()
  }

  async function annotateSelection(): Promise<void> {
    await onannotation?.()
    closeSelectionToolbar()
  }

  function handlePreviewMouseUp(): void {
    handleSelectionChange()
    onpreviewmouseup?.()
  }

  function handlePreviewInput(event: Event): void {
    onpreviewinput?.(event)
  }

  function handlePreviewBlur(): void {
    closeSelectionToolbar()
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
              content={content}
              title={title}
              sourceKind={sourceKind}
              codeLanguage={codeLanguage}
              actions={downloadActions}
              ondownload={ondownload}
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
      class:hai-ai-doc-layout-collapsed={outlineCollapsed}
      class='hai-ai-doc-layout'
    >
      {#if showOutline && !outlineCollapsed}
        <aside class='hai-ai-doc-outline'>
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
              {#each outline as item}
                <button
                  type='button'
                  class:active={activeHeadingId === item.id}
                  class='hai-ai-doc-outline-item'
                  style={`padding-left:${0.65 + (item.level - 1) * 0.56}rem`}
                  onclick={() => scrollToHeading(item.id)}
                >
                  {item.numberedTitle}
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
          onkeyup={handleSelectionChange}
          onfocusout={() => {
            if (typeof window !== 'undefined') {
              window.setTimeout(() => {
                handleSelectionChange()
              }, 0)
            }
          }}
        >
          {#if selectionToolbarVisible}
            <div
              class='hai-ai-doc-selection-layer'
              data-alignment={toolbarPosition.alignment}
              data-placement={toolbarPosition.placement}
              style={`top:${toolbarPosition.top}px; left:${toolbarPosition.left}px;`}
            >
              <div
                class='hai-ai-doc-selection-toolbar'
                role='toolbar'
                tabindex='-1'
                onmousedown={event => event.preventDefault()}
              >
                {#if onrewrite}
                  <button
                    type='button'
                    class='hai-ai-doc-selection-chip'
                    disabled={rewritePending}
                    onclick={() => (rewriteMenuOpen = !rewriteMenuOpen)}
                  >
                    <svg viewBox='0 0 24 24' aria-hidden='true'>
                      <path
                        d='M12 3.25a.75.75 0 0 1 .72.55l1.06 3.62 3.63 1.06a.75.75 0 0 1 0 1.44l-3.63 1.06-1.06 3.63a.75.75 0 0 1-1.44 0l-1.06-3.63-3.63-1.06a.75.75 0 0 1 0-1.44l3.63-1.06 1.06-3.62a.75.75 0 0 1 .72-.55Zm6.5 11.5a.75.75 0 0 1 .72.55l.42 1.43 1.43.42a.75.75 0 0 1 0 1.44l-1.43.42-.42 1.43a.75.75 0 0 1-1.44 0l-.42-1.43-1.43-.42a.75.75 0 0 1 0-1.44l1.43-.42.42-1.43a.75.75 0 0 1 .72-.55Z'
                      ></path>
                    </svg>
                    <span>{uiM('markdown_rewrite')}</span>
                  </button>
                {/if}

                {#if onapplyblockformat}
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

                {#if onapplyinlineformat}
                  {#if onapplyblockformat}
                    <span class='hai-ai-doc-selection-divider'></span>
                  {/if}
                  <button
                    type='button'
                    class='hai-ai-doc-selection-btn'
                    title={uiM('markdown_format_bold')}
                    onclick={() => applyInlineFormat('bold')}
                  >
                    <strong>B</strong>
                  </button>
                  <button
                    type='button'
                    class='hai-ai-doc-selection-btn'
                    title={uiM('markdown_format_strike')}
                    onclick={() => applyInlineFormat('strike')}
                  >
                    S
                  </button>
                  <button
                    type='button'
                    class='hai-ai-doc-selection-btn'
                    title={uiM('markdown_format_italic')}
                    onclick={() => applyInlineFormat('italic')}
                  >
                    <em>I</em>
                  </button>
                  <button
                    type='button'
                    class='hai-ai-doc-selection-btn'
                    title={uiM('markdown_format_underline')}
                    onclick={() => applyInlineFormat('underline')}
                  >
                    U
                  </button>
                  <button
                    type='button'
                    class='hai-ai-doc-selection-btn'
                    title={uiM('markdown_format_link')}
                    onclick={() => applyInlineFormat('link')}
                  >
                    <svg viewBox='0 0 24 24' aria-hidden='true'>
                      <path
                        d='M7.78 15.72a3.75 3.75 0 0 1 0-5.3l2.47-2.47a3.75 3.75 0 0 1 5.3 5.3l-.97.98a.75.75 0 0 1-1.06-1.06l.98-.97a2.25 2.25 0 0 0-3.19-3.19l-2.47 2.47a2.25 2.25 0 1 0 3.18 3.18l.49-.49a.75.75 0 0 1 1.06 1.06l-.49.49a3.75 3.75 0 0 1-5.3 0Zm8.44-7.44a.75.75 0 0 1 0 1.06l-8 8a.75.75 0 0 1-1.06-1.06l8-8a.75.75 0 0 1 1.06 0Z'
                      ></path>
                    </svg>
                  </button>
                  <button
                    type='button'
                    class='hai-ai-doc-selection-btn'
                    title={uiM('markdown_format_code')}
                    onclick={() => applyInlineFormat('code')}
                  >
                    &lt;/&gt;
                  </button>
                  <button
                    type='button'
                    class='hai-ai-doc-selection-btn'
                    title={uiM('markdown_format_highlight')}
                    onclick={() => applyInlineFormat('highlight')}
                  >
                    <span class='hai-ai-doc-selection-highlight-icon'>A</span>
                  </button>
                {/if}

                {#if oncopyselection || onannotation}
                  {#if onapplyinlineformat}
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

              {#if rewriteMenuOpen}
                <div
                  class='hai-ai-doc-rewrite-menu'
                  role='menu'
                  tabindex='-1'
                  onmousedown={event => event.preventDefault()}
                >
                  {#each resolvedRewriteActions as action}
                    <button
                      type='button'
                      disabled={rewritePending}
                      onclick={() => applyRewrite(action.id)}
                    >
                      {action.label}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}

          <article
            bind:this={previewHost}
            class={readerDocumentClass}
            contenteditable={editable}
            role='document'
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
    min-height: 0;
    height: 100%;
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
    display: grid;
    grid-template-rows: auto auto 1fr;
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
  :global(.hai-ai-doc-toolbar-icon:hover),
  .hai-ai-doc-toolbar-pill:not(:disabled):hover,
  :global(.hai-ai-doc-toolbar-pill:hover),
  .hai-ai-doc-toolbar-action:hover,
  .hai-ai-doc-toolbar-close:not(:disabled):hover,
  .hai-ai-doc-version-toggle:hover,
  .hai-ai-doc-outline-open:hover {
    border-color: oklch(var(--bc) / 0.16);
    background: color-mix(in srgb, white 70%, oklch(var(--b2)) 30%);
    color: oklch(var(--bc));
  }

  .hai-ai-doc-toolbar-icon:not(:disabled):hover,
  :global(.hai-ai-doc-toolbar-icon:hover),
  .hai-ai-doc-toolbar-pill:not(:disabled):hover,
  :global(.hai-ai-doc-toolbar-pill:hover),
  .hai-ai-doc-toolbar-close:not(:disabled):hover {
    transform: translateY(-1px);
    box-shadow: 0 12px 28px -22px oklch(var(--bc) / 0.36);
  }

  .hai-ai-doc-toolbar-icon:disabled,
  :global(.hai-ai-doc-toolbar-icon:disabled),
  .hai-ai-doc-toolbar-pill:disabled,
  :global(.hai-ai-doc-toolbar-pill:disabled),
  .hai-ai-doc-toolbar-close:disabled {
    opacity: 0.42;
    cursor: not-allowed;
    box-shadow: none;
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
    min-height: 0;
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr);
    position: relative;
    overflow: hidden;
  }

  .hai-ai-doc-layout.hai-ai-doc-layout-collapsed {
    grid-template-columns: minmax(0, 1fr);
  }

  .hai-ai-doc-outline {
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
    min-width: 0;
    min-height: 0;
    position: relative;
    z-index: 1;
  }

  .hai-ai-doc-scroll {
    position: relative;
    height: 100%;
    overflow: auto;
    padding: 0.5rem 0 1.75rem;
  }

  .hai-ai-doc-selection-layer {
    position: absolute;
    z-index: 30;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    width: min(max-content, calc(100% - 2rem));
    transform: translateX(-50%);
    pointer-events: none;
  }

  .hai-ai-doc-selection-layer[data-placement='top'] {
    flex-direction: column-reverse;
  }

  .hai-ai-doc-selection-layer[data-alignment='left'] {
    transform: none;
  }

  .hai-ai-doc-selection-layer[data-alignment='right'] {
    transform: translateX(-100%);
  }

  .hai-ai-doc-selection-toolbar {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    flex-wrap: wrap;
    max-width: min(calc(100vw - 2rem), 34rem);
    padding: 0.38rem;
    border-radius: 1.2rem;
    background: #fff;
    border: 1px solid color-mix(in srgb, oklch(var(--bc)) 9%, white 91%);
    box-shadow:
      0 30px 60px -34px rgb(15 23 42 / 0.28),
      0 14px 26px -18px rgb(15 23 42 / 0.16),
      0 0 0 1px rgb(255 255 255 / 0.94) inset;
    pointer-events: auto;
    isolation: isolate;
  }

  .hai-ai-doc-selection-chip,
  .hai-ai-doc-selection-btn {
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

  .hai-ai-doc-selection-chip:not(:disabled):hover,
  .hai-ai-doc-selection-btn:hover,
  .hai-ai-doc-rewrite-menu button:hover {
    transform: translateY(-1px);
  }

  .hai-ai-doc-selection-chip:disabled {
    opacity: 0.55;
    cursor: default;
  }

  .hai-ai-doc-selection-btn {
    width: 2.25rem;
    min-width: 2.25rem;
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
    min-width: 2.25rem;
  }

  .hai-ai-doc-selection-btn:hover {
    border-color: oklch(var(--bc) / 0.1);
    background: oklch(var(--bc) / 0.045);
    color: oklch(var(--bc));
  }

  .hai-ai-doc-selection-btn svg {
    width: 1rem;
    height: 1rem;
    fill: currentColor;
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
  }

  .hai-ai-doc-selection-highlight-icon::after {
    content: '';
    position: absolute;
    left: -0.08rem;
    right: -0.08rem;
    bottom: -0.02rem;
    height: 0.36rem;
    border-radius: 9999px;
    background: oklch(var(--wa, 0.9 0.14 90) / 0.45);
    z-index: -1;
  }

  .hai-ai-doc-rewrite-menu {
    width: 13.75rem;
    display: grid;
    gap: 0.375rem;
    padding: 0.5rem;
    border-radius: 1.125rem;
    background: #fff;
    border: 1px solid color-mix(in srgb, oklch(var(--bc)) 9%, white 91%);
    box-shadow:
      0 30px 60px -34px rgb(15 23 42 / 0.28),
      0 14px 26px -18px rgb(15 23 42 / 0.16),
      0 0 0 1px rgb(255 255 255 / 0.94) inset;
    pointer-events: auto;
    isolation: isolate;
  }

  .hai-ai-doc-rewrite-menu button {
    text-align: left;
    border: 1px solid transparent;
    border-radius: 0.875rem;
    padding: 0.7rem 0.8rem;
    color: oklch(var(--bc) / 0.9);
    background: transparent;
    cursor: pointer;
  }

  .hai-ai-doc-rewrite-menu button:disabled {
    opacity: 0.55;
    cursor: default;
  }

  .hai-markdown {
    line-height: 1.9;
    color: inherit;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }

  .hai-markdown-document {
    max-width: 52.5rem;
    margin: 0 auto;
    padding: 1.25rem 2rem 6rem;
    outline: none;
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

  .hai-markdown :global(a) {
    color: oklch(var(--p));
    text-decoration: none;
    font-weight: 500;
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
    background: oklch(var(--n) / 0.94);
    border-bottom: 1px solid oklch(var(--nc) / 0.1);
  }

  .hai-markdown :global(.hai-md-code-header-main) {
    min-width: 0;
    display: flex;
    align-items: center;
  }

  .hai-markdown :global(.hai-md-code-actions) {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .hai-markdown :global(.hai-md-code-lang) {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: oklch(var(--nc) / 0.6);
    user-select: none;
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
    line-height: 1.6;
    tab-size: 2;
  }

  .hai-markdown :global(.hai-md-code-preview-slot) {
    border-top: 1px solid oklch(var(--nc) / 0.08);
    background: oklch(var(--b1));
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

  .hai-md-preview-card {
    margin: 0;
    padding: 1rem;
    background: oklch(var(--b1));
    color: oklch(var(--bc));
  }

  .hai-md-preview-head {
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: oklch(var(--bc) / 0.7);
  }

  .hai-md-preview-desc {
    margin: 0.5rem 0 0;
    font-size: 0.875rem;
    color: oklch(var(--bc) / 0.7);
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

  .hai-md-preview-frame {
    display: block;
    width: 100%;
    min-height: 280px;
    margin-top: 0.85rem;
    border: 1px solid oklch(var(--bc) / 0.1);
    border-radius: 1rem;
    background: white;
  }

  .hai-md-preview-loading {
    width: 100%;
    height: 4px;
    margin-top: 0.85rem;
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

  .hai-md-preview-rendered :global(:first-child) {
    margin-top: 0.85rem;
  }

  .hai-markdown :global(.hljs-keyword),
  .hai-markdown :global(.hljs-selector-tag),
  .hai-markdown :global(.hljs-literal),
  .hai-markdown :global(.hljs-section),
  .hai-markdown :global(.hljs-link) {
    color: oklch(0.7 0.15 280);
  }

  .hai-markdown :global(.hljs-string),
  .hai-markdown :global(.hljs-addition) {
    color: oklch(0.75 0.12 150);
  }

  .hai-markdown :global(.hljs-number),
  .hai-markdown :global(.hljs-type) {
    color: oklch(0.78 0.12 70);
  }

  .hai-markdown :global(.hljs-comment),
  .hai-markdown :global(.hljs-quote),
  .hai-markdown :global(.hljs-meta) {
    color: oklch(var(--nc) / 0.45);
    font-style: italic;
  }

  .hai-markdown :global(.hljs-title),
  .hai-markdown :global(.hljs-name) {
    color: oklch(0.75 0.12 210);
  }

  .hai-markdown :global(.hljs-variable),
  .hai-markdown :global(.hljs-template-variable) {
    color: oklch(0.8 0.1 30);
  }

  .hai-markdown :global(.hljs-built_in),
  .hai-markdown :global(.hljs-builtin-name) {
    color: oklch(0.75 0.15 200);
  }

  .hai-markdown :global(.hljs-attr),
  .hai-markdown :global(.hljs-attribute) {
    color: oklch(0.78 0.1 80);
  }

  .hai-markdown :global(.hljs-symbol),
  .hai-markdown :global(.hljs-bullet) {
    color: oklch(0.75 0.12 320);
  }

  .hai-markdown :global(.hljs-deletion) {
    color: oklch(0.7 0.15 25);
  }

  .hai-markdown :global(.hljs-regexp),
  .hai-markdown :global(.hljs-selector-id),
  .hai-markdown :global(.hljs-selector-class) {
    color: oklch(0.7 0.15 25);
  }

  .hai-markdown :global(.hljs-emphasis) {
    font-style: italic;
  }

  .hai-markdown :global(.hljs-strong) {
    font-weight: 700;
  }

  @keyframes hai-md-loading {
    from {
      background-position: 220px 0;
    }

    to {
      background-position: -220px 0;
    }
  }

  @media (max-width: 960px) {
    .hai-ai-doc-layout,
    .hai-ai-doc-layout.hai-ai-doc-layout-collapsed {
      grid-template-columns: minmax(0, 1fr);
    }

    .hai-ai-doc-outline {
      display: none;
    }

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
      overflow: auto;
    }
  }
</style>
